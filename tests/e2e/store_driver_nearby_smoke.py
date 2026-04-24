import os
import re
import subprocess
from datetime import datetime
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://localhost:5173")
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3001/api")
SOCKET_URL = os.environ.get("SOCKET_URL", "http://localhost:3001")
SUPERADMIN_EMAIL = "gabriel@gabriel.com"
SUPERADMIN_PASSWORD = "Gabriel123!"
TEMP_PASSWORD = "Gabriel123!"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
ROOT = Path(__file__).resolve().parents[2]
EMITTER = Path(__file__).resolve().parent / "emit_location_update.mjs"


def api_json(request_context, method: str, path: str, *, token: str | None = None, data=None, expected_status: int = 200):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = request_context.fetch(
        f"{API_BASE_URL}{path}",
        method=method,
        headers=headers,
        data=data,
    )

    if response.status != expected_status:
        raise RuntimeError(f"{method} {path} -> {response.status}: {response.text()}")

    if expected_status == 204:
        return None

    return response.json()


def wait_for_unread_alert(page, label: str, total: int) -> None:
    alert_button = page.get_by_role("button", name=re.compile("Alertas"))
    expect(alert_button.get_by_text(str(total), exact=True)).to_be_visible(timeout=15000)
    page.get_by_role("button", name=re.compile("Alertas")).click()
    expect(page.get_by_text(label, exact=True)).to_have_count(1, timeout=15000)
    page.get_by_role("button", name=re.compile("Pedidos")).click()


def emit_location_update(vehicle_id: str, lat: float, lng: float, token: str) -> None:
    env = os.environ.copy()
    env["SOCKET_URL"] = SOCKET_URL
    env["VEHICLE_ID"] = vehicle_id
    env["TOKEN"] = token
    env["LAT"] = str(lat)
    env["LNG"] = str(lng)
    subprocess.run(
        ["node", str(EMITTER)],
        cwd=str(ROOT),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    location_name = f"Codex QA Near RT {stamp}"
    store_email = f"codex.superadmin.qa.store.near.rt.{stamp}@example.com"
    driver_email = f"codex.superadmin.qa.driver.near.rt.{stamp}@example.com"
    plate = f"RT{stamp[-6:]}"
    bulto_code = f"QART-{stamp[-6:]}"

    location = None
    order = None
    bulto = None
    vehicle = None
    driver = None
    superadmin_token = None

    with sync_playwright() as p:
        request_context = p.request.new_context()
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        try:
            login_data = api_json(
                request_context,
                "POST",
                "/auth/login",
                data={"email": SUPERADMIN_EMAIL, "password": SUPERADMIN_PASSWORD},
            )
            superadmin_token = login_data["token"]
            company_id = login_data["user"]["profile"]["company_id"]

            location = api_json(
                request_context,
                "POST",
                "/stores",
                token=superadmin_token,
                data={
                    "name": location_name,
                    "location_type": "store",
                    "address": "QA nearby smoke",
                    "lat": -34.6037,
                    "lng": -58.3816,
                    "is_active": True,
                    "rider_visible": True,
                    "is_temporary": True,
                },
                expected_status=201,
            )

            api_json(
                request_context,
                "POST",
                f"/companies/{company_id}/profiles",
                token=superadmin_token,
                data={
                    "email": store_email,
                    "password": TEMP_PASSWORD,
                    "role": "store",
                    "full_name": f"Codex QA Store Nearby {stamp}",
                    "location_id": location["id"],
                },
                expected_status=201,
            )

            driver_profile = api_json(
                request_context,
                "POST",
                f"/companies/{company_id}/profiles",
                token=superadmin_token,
                data={
                    "email": driver_email,
                    "password": TEMP_PASSWORD,
                    "role": "admin",
                    "full_name": f"Codex QA Driver Nearby {stamp}",
                },
                expected_status=201,
            )

            vehicle = api_json(
                request_context,
                "POST",
                "/vehicles",
                token=superadmin_token,
                data={
                    "plate": plate,
                    "brand": "QA",
                    "model": "Nearby",
                    "color": "White",
                },
                expected_status=201,
            )

            driver = api_json(
                request_context,
                "POST",
                "/drivers",
                token=superadmin_token,
                data={
                    "profile_id": driver_profile["profile"]["id"],
                    "license_number": f"QA-{stamp[-8:]}",
                    "license_expiry": "2030-12-31",
                    "assigned_vehicle_id": vehicle["id"],
                },
                expected_status=201,
            )

            bulto = api_json(
                request_context,
                "POST",
                "/bultos",
                token=superadmin_token,
                data={
                    "codigo_lote": bulto_code,
                    "cantidad_esperada": 1,
                    "clave_desbloqueo": "QA1234",
                    "descripcion": "Smoke driver nearby",
                },
                expected_status=201,
            )

            order = api_json(
                request_context,
                "POST",
                "/orders",
                token=superadmin_token,
                data={
                    "bulto_id": bulto["id"],
                    "location_id": location["id"],
                    "customer_name": f"Cliente Nearby {stamp}",
                    "delivery_address": "Av. QA Nearby 123",
                },
                expected_status=201,
            )

            driver_login = api_json(
                request_context,
                "POST",
                "/auth/login",
                data={"email": driver_email, "password": TEMP_PASSWORD},
            )
            driver_token = driver_login["token"]

            api_json(
                request_context,
                "POST",
                "/bultos/validate",
                token=driver_token,
                data={"codigo_lote": bulto_code, "conteo_ingresado": 1},
            )

            api_json(
                request_context,
                "PUT",
                f"/orders/{order['id']}/status",
                token=superadmin_token,
                data={"status": "ACCEPTED"},
            )

            page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            page.locator('input[type="email"]').fill(store_email)
            page.locator('input[type="password"]').fill(TEMP_PASSWORD)
            page.get_by_role("button", name="Ingresar al panel").click()

            page.wait_for_url(f"{BASE_URL}/store/dashboard", timeout=15000)
            page.wait_for_load_state("networkidle")
            expect(page.get_by_role("heading", name="Mis pedidos")).to_be_visible(timeout=15000)
            expect(page.get_by_role("button", name=re.compile("Alertas"))).to_be_visible(timeout=15000)

            emit_location_update(vehicle["id"], -34.6037, -58.3816, driver_token)

            wait_for_unread_alert(page, "Repartidor cerca", 1)
            expect(page.get_by_text("Estado del Repartidor")).to_be_visible(timeout=15000)
            expect(page.get_by_text(re.compile("REPARTIDOR CERCA"))).to_be_visible(timeout=15000)
            expect(page.get_by_title("driver-proximity-map")).to_be_visible(timeout=15000)

            page.screenshot(path=str(ARTIFACTS / "store-driver-nearby-smoke.png"), full_page=True)
            print("OK: portal de despacho validado con driver_nearby realtime sin alertas duplicadas")
            print(f"Store profile: {store_email}")
            print(f"Driver profile: {driver_email}")
            print(f"Location: {location_name} ({location['id']})")
            print(f"Vehicle: {vehicle['id']}")
            print(f"Order: {order['id']}")
            print(f"Screenshot: {ARTIFACTS / 'store-driver-nearby-smoke.png'}")
        finally:
            if order and superadmin_token:
                api_json(request_context, "DELETE", f"/orders/{order['id']}", token=superadmin_token, expected_status=204)
            if bulto and superadmin_token:
                api_json(request_context, "DELETE", f"/bultos/{bulto['id']}", token=superadmin_token, expected_status=204)
            if driver and superadmin_token:
                api_json(request_context, "DELETE", f"/drivers/{driver['id']}", token=superadmin_token, expected_status=204)
            if vehicle and superadmin_token:
                api_json(request_context, "DELETE", f"/vehicles/{vehicle['id']}", token=superadmin_token, expected_status=204)
            if location and superadmin_token:
                api_json(request_context, "DELETE", f"/stores/{location['id']}", token=superadmin_token, expected_status=204)

            browser.close()
            request_context.dispose()


if __name__ == "__main__":
    main()
