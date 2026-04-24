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


def assert_ids_only(records, *, own_id: str, foreign_id: str, label: str) -> None:
    ids = {record["id"] for record in records}
    if own_id not in ids:
        raise AssertionError(f"{label}: falta el recurso propio {own_id}")
    if foreign_id in ids:
        raise AssertionError(f"{label}: aparecio el recurso ajeno {foreign_id}")


def find_order(records, order_id: str):
    for record in records:
        if record["id"] == order_id:
            return record
    raise AssertionError(f"No se encontro el pedido {order_id}")


def run_cleanup() -> None:
    subprocess.run(
        ["node", "--env-file=.env", str(CLEANUP)],
        cwd=str(ROOT),
        check=True,
        capture_output=True,
        text=True,
    )


def spawn_socket_capture(label: str, token: str, events: list[str]) -> dict:
    suffix = time.time_ns()
    ready_file = ARTIFACTS / f"tenant-isolation-{label}-{suffix}.ready.json"
    output_file = ARTIFACTS / f"tenant-isolation-{label}-{suffix}-socket.json"

    env = os.environ.copy()
    env["SOCKET_URL"] = SOCKET_URL
    env["TOKEN"] = token
    env["EVENTS"] = json.dumps(events)
    env["READY_FILE"] = str(ready_file)
    env["OUTPUT_FILE"] = str(output_file)
    env["WAIT_MS"] = "4000"

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

    if not capture["output_file"].exists():
        raise RuntimeError(f"Socket capture {capture['label']} no genero artifact")

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


def assert_has_event(payload: dict, event_name: str, *, label: str) -> None:
    event_names = {event["event"] for event in payload.get("events", [])}
    if event_name not in event_names:
        raise AssertionError(f"{label}: falta el evento {event_name}")


def assert_has_any_event(payload: dict, event_names: list[str], *, label: str) -> None:
    captured = {event["event"] for event in payload.get("events", [])}
    if not any(event_name in captured for event_name in event_names):
        raise AssertionError(f"{label}: no aparecio ninguno de los eventos esperados {event_names}")


def assert_no_events(payload: dict, forbidden_events: list[str], *, label: str) -> None:
    captured = {event["event"] for event in payload.get("events", [])}
    leaked = sorted(event_name for event_name in forbidden_events if event_name in captured)
    if leaked:
        raise AssertionError(f"{label}: aparecieron eventos ajenos {leaked}")


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    company_a = None
    company_b = None
    location_a = None
    location_b = None
    order_a = None
    order_b = None
    admin_a_token = None
    admin_b_token = None
    store_a_token = None
    store_b_token = None
    store_a_capture = None
    store_b_capture = None

    artifact = {
        "block_id": "FT-TENANT-001",
        "status": "running",
        "scope": "Tenant isolation smoke sobre stores/orders y rooms realtime de pedidos",
        "artifacts": [],
        "commands_run": [],
        "risks": "",
        "terminology_check": "Verified vs MEMORY.md",
        "next_agent": "QA Runner",
        "asserts": [],
    }

    company_a_name = f"Codex QA Tenant A {stamp}"
    company_b_name = f"Codex QA Tenant B {stamp}"
    admin_a_email = f"codex.superadmin.qa.tenant.a.{stamp}@example.com"
    admin_b_email = f"codex.superadmin.qa.tenant.b.{stamp}@example.com"
    store_a_email = f"codex.superadmin.qa.tenant.store.a.{stamp}@example.com"
    store_b_email = f"codex.superadmin.qa.tenant.store.b.{stamp}@example.com"
    artifact_path = ARTIFACTS / "tenant-isolation-smoke.json"

    try:
        login = api_json(
            "/auth/login",
            method="POST",
            data={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
        )
        superadmin_token = login["token"]
        artifact["commands_run"].append("POST /auth/login (super_admin)")

        company_a = api_json(
            "/companies",
            method="POST",
            token=superadmin_token,
            data={"name": company_a_name, "plan": "basic"},
            expected_status=201,
        )
        company_b = api_json(
            "/companies",
            method="POST",
            token=superadmin_token,
            data={"name": company_b_name, "plan": "basic"},
            expected_status=201,
        )
        artifact["commands_run"].extend(["POST /companies (tenant A)", "POST /companies (tenant B)"])

        api_json(
            f"/companies/{company_a['id']}/profiles",
            method="POST",
            token=superadmin_token,
            data={
                "email": admin_a_email,
                "password": TEMP_PASSWORD,
                "role": "admin",
                "full_name": f"Codex QA Tenant Admin A {stamp}",
            },
            expected_status=201,
        )
        api_json(
            f"/companies/{company_b['id']}/profiles",
            method="POST",
            token=superadmin_token,
            data={
                "email": admin_b_email,
                "password": TEMP_PASSWORD,
                "role": "admin",
                "full_name": f"Codex QA Tenant Admin B {stamp}",
            },
            expected_status=201,
        )
        artifact["commands_run"].extend([
            "POST /companies/:id/profiles (tenant A admin)",
            "POST /companies/:id/profiles (tenant B admin)",
        ])

        admin_a_login = api_json(
            "/auth/login",
            method="POST",
            data={"email": admin_a_email, "password": TEMP_PASSWORD},
        )
        admin_b_login = api_json(
            "/auth/login",
            method="POST",
            data={"email": admin_b_email, "password": TEMP_PASSWORD},
        )
        admin_a_token = admin_a_login["token"]
        admin_b_token = admin_b_login["token"]
        artifact["commands_run"].extend(["POST /auth/login (tenant A admin)", "POST /auth/login (tenant B admin)"])

        me_a = admin_a_login["user"]["profile"]
        me_b = admin_b_login["user"]["profile"]
        if me_a["company_id"] == me_b["company_id"]:
            raise AssertionError("auth/me devolvio el mismo tenant para ambos admins QA")
        artifact["asserts"].append("login separa company_id entre admins QA")

        location_a = api_json(
            "/stores",
            method="POST",
            token=admin_a_token,
            data={
                "name": f"Codex QA Tenant Location A {stamp}",
                "location_type": "store",
                "address": "Tenant A",
                "is_active": True,
                "rider_visible": True,
                "is_temporary": True,
            },
            expected_status=201,
        )
        location_b = api_json(
            "/stores",
            method="POST",
            token=admin_b_token,
            data={
                "name": f"Codex QA Tenant Location B {stamp}",
                "location_type": "store",
                "address": "Tenant B",
                "is_active": True,
                "rider_visible": True,
                "is_temporary": True,
            },
            expected_status=201,
        )
        artifact["commands_run"].extend(["POST /stores (tenant A)", "POST /stores (tenant B)"])

        api_json(
            f"/companies/{company_a['id']}/profiles",
            method="POST",
            token=superadmin_token,
            data={
                "email": store_a_email,
                "password": TEMP_PASSWORD,
                "role": "store",
                "full_name": f"Codex QA Tenant Store A {stamp}",
                "store_id": location_a["id"],
            },
            expected_status=201,
        )
        api_json(
            f"/companies/{company_b['id']}/profiles",
            method="POST",
            token=superadmin_token,
            data={
                "email": store_b_email,
                "password": TEMP_PASSWORD,
                "role": "store",
                "full_name": f"Codex QA Tenant Store B {stamp}",
                "location_id": location_b["id"],
            },
            expected_status=201,
        )
        artifact["commands_run"].extend([
            "POST /companies/:id/profiles (tenant A store)",
            "POST /companies/:id/profiles (tenant B store)",
        ])

        store_a_login = api_json(
            "/auth/login",
            method="POST",
            data={"email": store_a_email, "password": TEMP_PASSWORD},
        )
        store_b_login = api_json(
            "/auth/login",
            method="POST",
            data={"email": store_b_email, "password": TEMP_PASSWORD},
        )
        store_a_token = store_a_login["token"]
        store_b_token = store_b_login["token"]
        artifact["commands_run"].extend(["POST /auth/login (tenant A store)", "POST /auth/login (tenant B store)"])

        store_me_a = store_a_login["user"]["profile"]
        store_me_b = store_b_login["user"]["profile"]
        if store_me_a.get("location_id") != location_a["id"]:
            raise AssertionError("login del store A no devolvio location_id esperado")
        if store_me_b.get("location_id") != location_b["id"]:
            raise AssertionError("login del store B no devolvio location_id esperado")
        artifact["asserts"].append("login expone location_id correcto en perfiles store QA")

        order_a = api_json(
            "/orders",
            method="POST",
            token=admin_a_token,
            data={
                "location_id": location_a["id"],
                "customer_name": f"Cliente Tenant A {stamp}",
                "delivery_address": "Direccion Tenant A",
            },
            expected_status=201,
        )
        order_b = api_json(
            "/orders",
            method="POST",
            token=admin_b_token,
            data={
                "store_id": location_b["id"],
                "customer_name": f"Cliente Tenant B {stamp}",
                "delivery_address": "Direccion Tenant B",
            },
            expected_status=201,
        )
        artifact["commands_run"].extend(["POST /orders (tenant A)", "POST /orders (tenant B)"])
        if order_a.get("location_id") != location_a["id"] or order_a.get("store_id") != location_a["id"]:
            raise AssertionError("POST /orders canonico no devolvio aliases consistentes en tenant A")
        if order_b.get("location_id") != location_b["id"] or order_b.get("store_id") != location_b["id"]:
            raise AssertionError("POST /orders legacy no devolvio aliases consistentes en tenant B")
        artifact["asserts"].append("POST /orders responde bien con location_id canonico y store_id legacy")

        stores_a = api_json("/stores", token=admin_a_token)
        stores_b = api_json("/stores", token=admin_b_token)
        assert_ids_only(stores_a, own_id=location_a["id"], foreign_id=location_b["id"], label="stores tenant A")
        assert_ids_only(stores_b, own_id=location_b["id"], foreign_id=location_a["id"], label="stores tenant B")
        artifact["asserts"].append("GET /stores aisla ubicaciones por tenant")

        orders_a = api_json("/orders", token=admin_a_token)
        orders_b = api_json("/orders", token=admin_b_token)
        assert_ids_only(orders_a, own_id=order_a["id"], foreign_id=order_b["id"], label="orders tenant A")
        assert_ids_only(orders_b, own_id=order_b["id"], foreign_id=order_a["id"], label="orders tenant B")
        artifact["asserts"].append("GET /orders aisla pedidos por tenant")

        store_a_orders_with_foreign_filter = api_json(
            f"/orders?location_id={location_b['id']}",
            token=store_a_token,
        )
        assert_ids_only(
            store_a_orders_with_foreign_filter,
            own_id=order_a["id"],
            foreign_id=order_b["id"],
            label="store A orders with foreign location_id filter",
        )
        artifact["asserts"].append("GET /orders ignora location_id ajeno en perfil store")

        store_a_orders_with_legacy_filter = api_json(
            f"/orders?store_id={location_b['id']}",
            token=store_a_token,
        )
        assert_ids_only(
            store_a_orders_with_legacy_filter,
            own_id=order_a["id"],
            foreign_id=order_b["id"],
            label="store A orders with foreign store_id filter",
        )
        artifact["asserts"].append("GET /orders ignora store_id ajeno en perfil store")

        foreign_create = api_json(
            "/orders",
            method="POST",
            token=admin_a_token,
            data={
                "location_id": location_b["id"],
                "customer_name": f"Cliente Cruce {stamp}",
                "delivery_address": "Direccion Cruce",
            },
            expected_status=403,
        )
        if foreign_create.get("error") != "location_id no pertenece a tu empresa":
            raise AssertionError("POST /orders con location_id ajeno no devolvio el error esperado")
        artifact["asserts"].append("POST /orders rechaza location_id ajeno por company_id")

        foreign_create_legacy = api_json(
            "/orders",
            method="POST",
            token=admin_a_token,
            data={
                "store_id": location_b["id"],
                "customer_name": f"Cliente Cruce Legacy {stamp}",
                "delivery_address": "Direccion Cruce Legacy",
            },
            expected_status=403,
        )
        if foreign_create_legacy.get("error") != "location_id no pertenece a tu empresa":
            raise AssertionError("POST /orders con store_id ajeno no devolvio el error esperado")
        artifact["asserts"].append("POST /orders rechaza store_id ajeno por company_id")

        foreign_mutation = api_json(
            f"/orders/{order_b['id']}/status",
            method="PUT",
            token=admin_a_token,
            data={"status": "ACCEPTED"},
            expected_status=(400, 403, 404),
        )
        if foreign_mutation.get("status") == "ACCEPTED":
            raise AssertionError("PUT /orders/:id/status acepto mutacion sobre pedido ajeno")

        order_b_after = find_order(api_json("/orders", token=admin_b_token), order_b["id"])
        if order_b_after["status"] != order_b["status"]:
            raise AssertionError("PUT /orders/:id/status altero el pedido ajeno pese al rechazo")
        artifact["asserts"].append("PUT /orders/:id/status no muta pedidos de otro tenant")

        event_names_a = [
            "order:status_update",
            f"location:{location_a['id']}:order_ready",
            f"store:{location_a['id']}:order_ready",
        ]
        event_names_b = [
            "order:status_update",
            f"location:{location_a['id']}:order_ready",
            f"store:{location_a['id']}:order_ready",
        ]
        store_a_capture = spawn_socket_capture("tenant-a", store_a_token, event_names_a)
        store_b_capture = spawn_socket_capture("tenant-b", store_b_token, event_names_b)
        artifact["commands_run"].extend([
            "node tests/e2e/capture_socket_events.mjs (tenant A store)",
            "node tests/e2e/capture_socket_events.mjs (tenant B store)",
        ])

        wait_for_ready(store_a_capture)
        wait_for_ready(store_b_capture)
        time.sleep(0.2)

        api_json(
            f"/orders/{order_a['id']}/ready",
            method="PATCH",
            token=admin_a_token,
        )
        artifact["commands_run"].append("PATCH /orders/:id/ready (tenant A)")

        capture_a_payload = finalize_capture(store_a_capture)
        capture_b_payload = finalize_capture(store_b_capture)
        artifact["artifacts"].extend([
            str(store_a_capture["output_file"]),
            str(store_b_capture["output_file"]),
        ])
        store_a_capture = None
        store_b_capture = None

        assert_has_event(capture_a_payload, "order:status_update", label="socket tenant A")
        assert_has_any_event(
            capture_a_payload,
            [f"location:{location_a['id']}:order_ready", f"store:{location_a['id']}:order_ready"],
            label="socket tenant A",
        )
        assert_no_events(
            capture_b_payload,
            ["order:status_update", f"location:{location_a['id']}:order_ready", f"store:{location_a['id']}:order_ready"],
            label="socket tenant B",
        )
        artifact["asserts"].append("Socket.io no fuga order_ready ni order:status_update a otro tenant")

        artifact["status"] = "done"
        artifact["artifacts"].append(str(artifact_path))
        artifact["risks"] = (
            "Cubre orders/stores y rooms realtime de pedidos. "
            "Quedan fuera vehicle:* / map y otros canales realtime."
        )
        artifact["next_agent"] = "Lead / Synth"

        artifact_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
        print("OK: tenant isolation validado por API y rooms realtime de pedidos")
        print(f"Artifact: {artifact_path}")
    finally:
        cleanup_errors = []

        terminate_capture(store_a_capture)
        terminate_capture(store_b_capture)

        if order_a and admin_a_token:
            try:
                api_json(f"/orders/{order_a['id']}", method="DELETE", token=admin_a_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete order A: {error}")
        if order_b and admin_b_token:
            try:
                api_json(f"/orders/{order_b['id']}", method="DELETE", token=admin_b_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete order B: {error}")
        if location_a and admin_a_token:
            try:
                api_json(f"/stores/{location_a['id']}", method="DELETE", token=admin_a_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete store A: {error}")
        if location_b and admin_b_token:
            try:
                api_json(f"/stores/{location_b['id']}", method="DELETE", token=admin_b_token, expected_status=204)
            except Exception as error:
                cleanup_errors.append(f"delete store B: {error}")

        try:
            run_cleanup()
        except Exception as error:
            cleanup_errors.append(f"cleanup_super_admin_qa.mjs: {error}")

        if cleanup_errors:
            raise RuntimeError(" | ".join(cleanup_errors))


if __name__ == "__main__":
    main()
