import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path


API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3001/api")
SOCKET_URL = os.environ.get("SOCKET_URL", "http://localhost:3001")
SUPERADMIN_EMAIL = "gabriel@gabriel.com"
SUPERADMIN_PASSWORD = "Gabriel123!"
TEMP_PASSWORD = "Gabriel123!"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
ROOT = Path(__file__).resolve().parents[2]
CLEANUP = ROOT / "tests" / "e2e" / "cleanup_super_admin_qa.mjs"
SOCKET_CAPTURE = ROOT / "tests" / "e2e" / "capture_socket_events.mjs"
SOCKET_EMITTER = ROOT / "tests" / "e2e" / "emit_location_update.mjs"


class ApiError(RuntimeError):
    def __init__(self, method: str, path: str, status: int, body: str):
        super().__init__(f"{method} {path} -> {status}: {body}")
        self.method = method
        self.path = path
        self.status = status
        self.body = body


def api_json(path: str, *, method: str = "GET", token: str | None = None, data=None, expected_status: int | tuple[int, ...] = 200):
    body = None if data is None else json.dumps(data).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(f"{API_BASE_URL}{path}", data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(request) as response:
            payload = response.read().decode()
            statuses = expected_status if isinstance(expected_status, tuple) else (expected_status,)
            if response.status not in statuses:
                raise ApiError(method, path, response.status, payload)
            return json.loads(payload) if payload else None
    except urllib.error.HTTPError as error:
        payload = error.read().decode()
        statuses = expected_status if isinstance(expected_status, tuple) else (expected_status,)
        if error.code not in statuses:
            raise ApiError(method, path, error.code, payload) from error
        return json.loads(payload) if payload else None


def run_cleanup() -> None:
    subprocess.run(
        ["node", "--env-file=.env", str(CLEANUP)],
        cwd=str(ROOT),
        check=True,
        capture_output=True,
        text=True,
    )


def spawn_socket_capture(label: str, token: str, events: list[str], *, wait_ms: int = 4500) -> dict:
    suffix = time.time_ns()
    ready_file = ARTIFACTS / f"map-authz-{label}-{suffix}.ready.json"
    output_file = ARTIFACTS / f"map-authz-{label}-{suffix}-socket.json"

    env = os.environ.copy()
    env["SOCKET_URL"] = SOCKET_URL
    env["TOKEN"] = token
    env["EVENTS"] = json.dumps(events)
    env["READY_FILE"] = str(ready_file)
    env["OUTPUT_FILE"] = str(output_file)
    env["WAIT_MS"] = str(wait_ms)

    process = subprocess.Popen(
        ["node", str(SOCKET_CAPTURE)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    return {
        "label": label,
        "process": process,
        "ready_file": ready_file,
        "output_file": output_file,
    }


def wait_for_ready(capture: dict, *, timeout_seconds: float = 10.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if capture["ready_file"].exists():
            return

        if capture["process"].poll() is not None:
            stdout, stderr = capture["process"].communicate()
            raise RuntimeError(
                f"Socket capture {capture['label']} termino antes de conectarse: "
                f"stdout={stdout.strip()} stderr={stderr.strip()}"
            )

        time.sleep(0.1)

    raise TimeoutError(f"Socket capture {capture['label']} no quedo listo a tiempo")


def finalize_capture(capture: dict) -> dict:
    stdout, stderr = capture["process"].communicate(timeout=10)
    if capture["process"].returncode != 0:
        raise RuntimeError(
            f"Socket capture {capture['label']} fallo: "
            f"stdout={stdout.strip()} stderr={stderr.strip()}"
        )

    payload = json.loads(capture["output_file"].read_text(encoding="utf-8"))
    if payload.get("status") != "done":
        raise RuntimeError(f"Socket capture {capture['label']} quedo en estado {payload.get('status')}")
    return payload


def terminate_capture(capture: dict | None) -> None:
    if not capture:
        return
    process = capture["process"]
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


def emit_location_update(vehicle_id: str, token: str, lat: float, lng: float) -> None:
    env = os.environ.copy()
    env["SOCKET_URL"] = SOCKET_URL
    env["VEHICLE_ID"] = vehicle_id
    env["TOKEN"] = token
    env["LAT"] = str(lat)
    env["LNG"] = str(lng)
    subprocess.run(
        ["node", str(SOCKET_EMITTER)],
        cwd=str(ROOT),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def assert_ids_only(records, *, own_id: str, foreign_id: str, label: str) -> None:
    ids = {record["id"] for record in records}
    if own_id not in ids:
        raise AssertionError(f"{label}: falta el recurso propio {own_id}")
    if foreign_id in ids:
        raise AssertionError(f"{label}: aparecio el recurso ajeno {foreign_id}")


def assert_has_event(payload: dict, event_name: str, *, label: str) -> None:
    if event_name not in {event["event"] for event in payload.get("events", [])}:
        raise AssertionError(f"{label}: falta el evento {event_name}")


def assert_no_events(payload: dict, forbidden_events: list[str], *, label: str) -> None:
    leaked = sorted({event["event"] for event in payload.get("events", [])} & set(forbidden_events))
    if leaked:
        raise AssertionError(f"{label}: aparecieron eventos no permitidos {leaked}")


def find_order(records, order_id: str) -> dict:
    for record in records:
        if record["id"] == order_id:
            return record
    raise AssertionError(f"No se encontro el pedido {order_id}")


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")

    artifact = {
        "block_id": "FT-MAP-AUTHZ-001",
        "status": "running",
        "scope": "Aislamiento authz de /map sobre vehicles, drivers, cash, active-orders y GPS realtime",
        "artifacts": [],
        "commands_run": [],
        "risks": "",
        "terminology_check": "Verified vs MEMORY.md",
        "next_agent": "QA Runner",
        "asserts": [],
    }

    company_a = None
    company_b = None
    vehicle_a1 = None
    vehicle_a2 = None
    vehicle_b1 = None
    driver_record_a1 = None
    driver_record_a2 = None
    driver_record_b1 = None
    bulto_a1 = None
    order_a1 = None
    admin_a_capture = None
    admin_b_capture = None
    spoof_a_capture = None
    spoof_b_capture = None

    superadmin_token = None
    admin_a_token = None
    admin_b_token = None
    driver_a1_token = None
    driver_a2_token = None
    driver_b1_token = None

    company_a_name = f"Codex QA Map Tenant A {stamp}"
    company_b_name = f"Codex QA Map Tenant B {stamp}"
    admin_a_email = f"codex.superadmin.qa.map.admin.a.{stamp}@example.com"
    admin_b_email = f"codex.superadmin.qa.map.admin.b.{stamp}@example.com"
    driver_a1_email = f"codex.superadmin.qa.map.driver.a1.{stamp}@example.com"
    driver_a2_email = f"codex.superadmin.qa.map.driver.a2.{stamp}@example.com"
    driver_b1_email = f"codex.superadmin.qa.map.driver.b1.{stamp}@example.com"
    artifact_path = ARTIFACTS / "map-authz-smoke.json"

    try:
        login = api_json(
            "/auth/login",
            method="POST",
            data={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
        )
        superadmin_token = login["token"]
        artifact["commands_run"].append("POST /auth/login (super_admin)")

        company_a = api_json("/companies", method="POST", token=superadmin_token, data={"name": company_a_name, "plan": "basic"}, expected_status=201)
        company_b = api_json("/companies", method="POST", token=superadmin_token, data={"name": company_b_name, "plan": "basic"}, expected_status=201)
        artifact["commands_run"].extend(["POST /companies (tenant A)", "POST /companies (tenant B)"])

        api_json(
            f"/companies/{company_a['id']}/profiles",
            method="POST",
            token=superadmin_token,
            data={"email": admin_a_email, "password": TEMP_PASSWORD, "role": "admin", "full_name": f"Codex QA Map Admin A {stamp}"},
            expected_status=201,
        )
        api_json(
            f"/companies/{company_b['id']}/profiles",
            method="POST",
            token=superadmin_token,
            data={"email": admin_b_email, "password": TEMP_PASSWORD, "role": "admin", "full_name": f"Codex QA Map Admin B {stamp}"},
            expected_status=201,
        )
        api_json(
            f"/companies/{company_a['id']}/profiles",
            method="POST",
            token=superadmin_token,
            data={"email": driver_a1_email, "password": TEMP_PASSWORD, "role": "admin", "full_name": f"Codex QA Map Driver A1 {stamp}"},
            expected_status=201,
        )
        api_json(
            f"/companies/{company_a['id']}/profiles",
            method="POST",
            token=superadmin_token,
            data={"email": driver_a2_email, "password": TEMP_PASSWORD, "role": "admin", "full_name": f"Codex QA Map Driver A2 {stamp}"},
            expected_status=201,
        )
        api_json(
            f"/companies/{company_b['id']}/profiles",
            method="POST",
            token=superadmin_token,
            data={"email": driver_b1_email, "password": TEMP_PASSWORD, "role": "admin", "full_name": f"Codex QA Map Driver B1 {stamp}"},
            expected_status=201,
        )
        artifact["commands_run"].append("POST /companies/:id/profiles (admins + drivers)")

        admin_a_login = api_json("/auth/login", method="POST", data={"email": admin_a_email, "password": TEMP_PASSWORD})
        admin_b_login = api_json("/auth/login", method="POST", data={"email": admin_b_email, "password": TEMP_PASSWORD})
        driver_a1_login = api_json("/auth/login", method="POST", data={"email": driver_a1_email, "password": TEMP_PASSWORD})
        driver_a2_login = api_json("/auth/login", method="POST", data={"email": driver_a2_email, "password": TEMP_PASSWORD})
        driver_b1_login = api_json("/auth/login", method="POST", data={"email": driver_b1_email, "password": TEMP_PASSWORD})

        admin_a_token = admin_a_login["token"]
        admin_b_token = admin_b_login["token"]
        driver_a1_token = driver_a1_login["token"]
        driver_a2_token = driver_a2_login["token"]
        driver_b1_token = driver_b1_login["token"]
        artifact["commands_run"].append("POST /auth/login (map admins + drivers)")

        driver_a1_profile_id = driver_a1_login["user"]["profile"]["id"]
        driver_a2_profile_id = driver_a2_login["user"]["profile"]["id"]
        driver_b1_profile_id = driver_b1_login["user"]["profile"]["id"]

        vehicle_a1 = api_json("/vehicles", method="POST", token=admin_a_token, data={"plate": f"MA{stamp[-6:]}", "brand": "QA", "model": "Map A1"}, expected_status=201)
        vehicle_a2 = api_json("/vehicles", method="POST", token=admin_a_token, data={"plate": f"MB{stamp[-6:]}", "brand": "QA", "model": "Map A2"}, expected_status=201)
        vehicle_b1 = api_json("/vehicles", method="POST", token=admin_b_token, data={"plate": f"MC{stamp[-6:]}", "brand": "QA", "model": "Map B1"}, expected_status=201)
        artifact["commands_run"].extend(["POST /vehicles (tenant A x2)", "POST /vehicles (tenant B)"])

        driver_record_a1 = api_json("/drivers", method="POST", token=admin_a_token, data={"profile_id": driver_a1_profile_id, "license_number": f"MAP-A1-{stamp[-6:]}", "license_expiry": "2030-12-31", "assigned_vehicle_id": vehicle_a1["id"]}, expected_status=201)
        driver_record_a2 = api_json("/drivers", method="POST", token=admin_a_token, data={"profile_id": driver_a2_profile_id, "license_number": f"MAP-A2-{stamp[-6:]}", "license_expiry": "2030-12-31", "assigned_vehicle_id": vehicle_a2["id"]}, expected_status=201)
        driver_record_b1 = api_json("/drivers", method="POST", token=admin_b_token, data={"profile_id": driver_b1_profile_id, "license_number": f"MAP-B1-{stamp[-6:]}", "license_expiry": "2030-12-31", "assigned_vehicle_id": vehicle_b1["id"]}, expected_status=201)
        artifact["commands_run"].extend(["POST /drivers (tenant A x2)", "POST /drivers (tenant B)"])

        bulto_a1 = api_json("/bultos", method="POST", token=admin_a_token, data={"codigo_lote": f"QAMAP-{stamp[-6:]}", "cantidad_esperada": 1, "clave_desbloqueo": "QA1234", "descripcion": "Smoke map authz"}, expected_status=201)
        artifact["commands_run"].append("POST /bultos (tenant A)")

        vehicles_a = api_json("/vehicles", token=admin_a_token)
        vehicles_b = api_json("/vehicles", token=admin_b_token)
        assert_ids_only(vehicles_a, own_id=vehicle_a1["id"], foreign_id=vehicle_b1["id"], label="vehicles tenant A")
        assert_ids_only(vehicles_b, own_id=vehicle_b1["id"], foreign_id=vehicle_a1["id"], label="vehicles tenant B")
        artifact["asserts"].append("GET /vehicles aisla flota por tenant")

        drivers_a = api_json("/drivers", token=admin_a_token)
        drivers_b = api_json("/drivers", token=admin_b_token)
        assert_ids_only(drivers_a, own_id=driver_record_a1["id"], foreign_id=driver_record_b1["id"], label="drivers tenant A")
        assert_ids_only(drivers_b, own_id=driver_record_b1["id"], foreign_id=driver_record_a1["id"], label="drivers tenant B")
        artifact["asserts"].append("GET /drivers aisla conductores por tenant")

        validate_payload = api_json("/bultos/validate", method="POST", token=driver_a1_token, data={"codigo_lote": bulto_a1["codigo_lote"], "conteo_ingresado": 1})
        if validate_payload.get("vehicle_id") != vehicle_a1["id"]:
            raise AssertionError("validateLote no devolvio vehicle_id esperado para map authz smoke")
        artifact["commands_run"].append("POST /bultos/validate (driver A1)")

        order_a1 = api_json(
            "/orders",
            method="POST",
            token=admin_a_token,
            data={"bulto_id": bulto_a1["id"], "customer_name": f"Cliente Map {stamp}", "delivery_address": "Av. QA Map 123", "payment_amount": 4200},
            expected_status=201,
        )
        api_json(f"/orders/{order_a1['id']}/status", method="PUT", token=admin_a_token, data={"status": "ACCEPTED"})
        artifact["commands_run"].extend(["POST /orders (tenant A)", "PUT /orders/:id/status ACCEPTED (tenant A)"])

        cash_a = api_json("/orders/cash-by-vehicle", token=admin_a_token)
        cash_b = api_json("/orders/cash-by-vehicle", token=admin_b_token)
        if vehicle_a1["id"] not in cash_a:
            raise AssertionError("cash-by-vehicle no incluyo el vehiculo A1")
        if vehicle_a1["id"] in cash_b:
            raise AssertionError("cash-by-vehicle filtro mal y expuso vehiculo A1 al tenant B")
        artifact["asserts"].append("GET /orders/cash-by-vehicle aisla cash del mapa por tenant")

        active_orders_a = api_json(f"/bultos/active-orders?vehicle_id={vehicle_a1['id']}", token=admin_a_token)
        active_orders_b = api_json(f"/bultos/active-orders?vehicle_id={vehicle_a1['id']}", token=admin_b_token)
        if active_orders_a["bulto"]["id"] != bulto_a1["id"]:
            raise AssertionError("active-orders no devolvio el bulto esperado para A1")
        if find_order(active_orders_a["orders"], order_a1["id"])["company_id"] != company_a["id"]:
            raise AssertionError("active-orders devolvio pedido con company_id incorrecto")
        if active_orders_b["orders"]:
            raise AssertionError("active-orders expuso pedidos ajenos al tenant B")
        artifact["asserts"].append("GET /bultos/active-orders aisla pedidos del mapa por tenant")

        http_location = api_json(
            "/trips/location",
            method="POST",
            token=driver_a1_token,
            data={"vehicle_id": vehicle_a1["id"], "lat": -34.6037, "lng": -58.3816, "speed_kmh": 30, "heading": 90},
            expected_status=201,
        )
        if http_location["vehicle_id"] != vehicle_a1["id"]:
            raise AssertionError("POST /trips/location no persistio vehicle_id esperado")
        artifact["commands_run"].append("POST /trips/location (driver A1)")

        last_location_a = api_json(f"/vehicles/{vehicle_a1['id']}/location", token=admin_a_token)
        if round(float(last_location_a["lat"]), 4) != -34.6037:
            raise AssertionError("GET /vehicles/:id/location no devolvio la coordenada esperada")
        api_json(f"/vehicles/{vehicle_a1['id']}/location", token=admin_b_token, expected_status=404)
        artifact["asserts"].append("GET /vehicles/:id/location no fuga coordenadas entre tenants")

        same_tenant_spoof = api_json(
            "/trips/location",
            method="POST",
            token=driver_a2_token,
            data={"vehicle_id": vehicle_a1["id"], "lat": -34.6, "lng": -58.38},
            expected_status=403,
        )
        cross_tenant_spoof = api_json(
            "/trips/location",
            method="POST",
            token=driver_b1_token,
            data={"vehicle_id": vehicle_a1["id"], "lat": -34.6, "lng": -58.38},
            expected_status=403,
        )
        if "No autorizado" not in same_tenant_spoof.get("error", "") or "No autorizado" not in cross_tenant_spoof.get("error", ""):
            raise AssertionError("POST /trips/location no devolvio rechazo de ownership esperado")
        artifact["asserts"].append("POST /trips/location exige ownership de vehículo")

        positive_events = [f"vehicle:{vehicle_a1['id']}", "order:status_update", "bulto:activated"]
        admin_a_capture = spawn_socket_capture("tenant-a-positive", admin_a_token, positive_events, wait_ms=5000)
        admin_b_capture = spawn_socket_capture("tenant-b-positive", admin_b_token, positive_events, wait_ms=5000)
        wait_for_ready(admin_a_capture)
        wait_for_ready(admin_b_capture)
        time.sleep(0.2)

        api_json("/bultos/validate", method="POST", token=driver_a1_token, data={"codigo_lote": bulto_a1["codigo_lote"], "conteo_ingresado": 1})
        api_json(f"/orders/{order_a1['id']}/status", method="PUT", token=admin_a_token, data={"status": "IN_TRANSIT"})
        emit_location_update(vehicle_a1["id"], driver_a1_token, -34.6045, -58.3823)
        artifact["commands_run"].append("node tests/e2e/emit_location_update.mjs (driver A1 -> vehicle A1)")
        artifact["commands_run"].extend([
            "POST /bultos/validate (driver A1, capture window)",
            "PUT /orders/:id/status IN_TRANSIT (tenant A, capture window)",
        ])

        admin_a_events = finalize_capture(admin_a_capture)
        admin_b_events = finalize_capture(admin_b_capture)
        artifact["artifacts"].extend([str(admin_a_capture["output_file"]), str(admin_b_capture["output_file"])])
        admin_a_capture = None
        admin_b_capture = None

        assert_has_event(admin_a_events, f"vehicle:{vehicle_a1['id']}", label="socket admin A")
        assert_has_event(admin_a_events, "order:status_update", label="socket admin A")
        assert_has_event(admin_a_events, "bulto:activated", label="socket admin A")
        assert_no_events(admin_b_events, positive_events, label="socket admin B")
        artifact["asserts"].append("Socket map events no fugan vehicle/order/bulto entre tenants")

        spoof_events = [f"vehicle:{vehicle_a1['id']}"]
        spoof_a_capture = spawn_socket_capture("tenant-a-spoof", admin_a_token, spoof_events, wait_ms=4500)
        spoof_b_capture = spawn_socket_capture("tenant-b-spoof", admin_b_token, spoof_events, wait_ms=4500)
        wait_for_ready(spoof_a_capture)
        wait_for_ready(spoof_b_capture)
        time.sleep(0.2)

        emit_location_update(vehicle_a1["id"], driver_a2_token, -34.7001, -58.4001)
        emit_location_update(vehicle_a1["id"], driver_b1_token, -34.7002, -58.4002)
        artifact["commands_run"].extend([
            "node tests/e2e/emit_location_update.mjs (driver A2 spoof -> vehicle A1)",
            "node tests/e2e/emit_location_update.mjs (driver B1 spoof -> vehicle A1)",
        ])

        spoof_a_events = finalize_capture(spoof_a_capture)
        spoof_b_events = finalize_capture(spoof_b_capture)
        artifact["artifacts"].extend([str(spoof_a_capture["output_file"]), str(spoof_b_capture["output_file"])])
        spoof_a_capture = None
        spoof_b_capture = None

        assert_no_events(spoof_a_events, spoof_events, label="socket spoof admin A")
        assert_no_events(spoof_b_events, spoof_events, label="socket spoof admin B")
        artifact["asserts"].append("Socket location:update rechaza spoofing de GPS")

        artifact["status"] = "done"
        artifact["artifacts"].append(str(artifact_path))
        artifact["risks"] = (
            "Cubre aislamiento de /map y ownership de GPS en vehicles/drivers/cash/active-orders/vehicle stream. "
            "Queda fuera RBAC fino intra-tenant de visibilidad de /map y tuning de performance realtime."
        )
        artifact["next_agent"] = "Lead / Synth"
        artifact_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
        print("OK: /map authz validado con aislamiento de coordenadas y bloqueo de spoofing GPS")
        print(f"Artifact: {artifact_path}")
    finally:
        cleanup_errors = []

        terminate_capture(admin_a_capture)
        terminate_capture(admin_b_capture)
        terminate_capture(spoof_a_capture)
        terminate_capture(spoof_b_capture)

        if order_a1 and admin_a_token:
            try:
                api_json(f"/orders/{order_a1['id']}", method="DELETE", token=admin_a_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete order A1: {error}")
        if bulto_a1 and admin_a_token:
            try:
                api_json(f"/bultos/{bulto_a1['id']}", method="DELETE", token=admin_a_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete bulto A1: {error}")
        if driver_record_a1 and admin_a_token:
            try:
                api_json(f"/drivers/{driver_record_a1['id']}", method="DELETE", token=admin_a_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete driver record A1: {error}")
        if driver_record_a2 and admin_a_token:
            try:
                api_json(f"/drivers/{driver_record_a2['id']}", method="DELETE", token=admin_a_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete driver record A2: {error}")
        if driver_record_b1 and admin_b_token:
            try:
                api_json(f"/drivers/{driver_record_b1['id']}", method="DELETE", token=admin_b_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete driver record B1: {error}")
        if vehicle_a1 and admin_a_token:
            try:
                api_json(f"/vehicles/{vehicle_a1['id']}", method="DELETE", token=admin_a_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete vehicle A1: {error}")
        if vehicle_a2 and admin_a_token:
            try:
                api_json(f"/vehicles/{vehicle_a2['id']}", method="DELETE", token=admin_a_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete vehicle A2: {error}")
        if vehicle_b1 and admin_b_token:
            try:
                api_json(f"/vehicles/{vehicle_b1['id']}", method="DELETE", token=admin_b_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete vehicle B1: {error}")

        try:
            run_cleanup()
        except Exception as error:
            cleanup_errors.append(f"cleanup_super_admin_qa.mjs: {error}")

        if cleanup_errors:
            raise RuntimeError(" | ".join(cleanup_errors))


if __name__ == "__main__":
    main()
