import os
from datetime import datetime
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://localhost:5173")
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3001/api")
SUPERADMIN_EMAIL = "gabriel@gabriel.com"
SUPERADMIN_PASSWORD = "Gabriel123!"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


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


def find_vehicle_by_plate(request_context, token: str, plate: str):
    vehicles = api_json(request_context, "GET", "/vehicles", token=token)
    return next((item for item in vehicles if item["plate"] == plate), None)


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    plate = f"QA{stamp[-6:]}"
    odometer = "12345"

    token = None
    vehicle_id = None

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
            token = login_data["token"]

            page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            page.locator('input[type="email"]').fill(SUPERADMIN_EMAIL)
            page.locator('input[type="password"]').fill(SUPERADMIN_PASSWORD)
            page.get_by_role("button", name="Ingresar al panel").click()

            page.wait_for_url(f"{BASE_URL}/dashboard", timeout=15000)
            page.wait_for_load_state("networkidle")
            page.get_by_test_id("sidebar-link-vehicles").click()
            page.wait_for_url(f"{BASE_URL}/vehicles", timeout=15000)
            page.wait_for_load_state("networkidle")

            page.get_by_test_id("vehicles-new-button").click()
            expect(page.get_by_test_id("vehicles-form")).to_be_visible(timeout=10000)
            page.get_by_test_id("vehicles-field-plate").fill(plate)
            page.get_by_test_id("vehicles-field-brand").fill("QA")
            page.get_by_test_id("vehicles-field-model").fill("Smoke")
            page.get_by_test_id("vehicles-field-year").fill("2025")
            page.get_by_test_id("vehicles-field-color").fill("Blanco")
            page.get_by_test_id("vehicles-submit").click()

            vehicle = None
            for _ in range(10):
                vehicle = find_vehicle_by_plate(request_context, token, plate)
                if vehicle:
                    break
                page.wait_for_timeout(1000)
            if not vehicle:
                raise RuntimeError("No se encontro el vehiculo QA recien creado por API")

            vehicle_id = vehicle["id"]

            row = page.get_by_test_id(f"vehicles-row-{vehicle_id}")
            expect(row).to_be_visible(timeout=15000)
            expect(row).to_contain_text("QA Smoke")

            page.get_by_test_id(f"vehicles-edit-{vehicle_id}").click()
            expect(page.get_by_test_id("vehicles-form")).to_be_visible(timeout=10000)
            page.get_by_test_id("vehicles-field-status").select_option("maintenance")
            page.get_by_test_id("vehicles-field-odometer").fill(odometer)
            page.get_by_test_id("vehicles-submit").click()

            expect(row).to_contain_text("Mantenimiento")
            expect(row).to_contain_text("12.345 km")

            page.get_by_test_id(f"vehicles-last-location-button-{vehicle_id}").click()
            expect(page.get_by_test_id(f"vehicles-last-location-panel-{vehicle_id}")).to_be_visible(timeout=10000)
            expect(page.get_by_test_id(f"vehicles-last-location-empty-{vehicle_id}")).to_be_visible(timeout=10000)

            page.screenshot(path=str(ARTIFACTS / "vehicles-crud-smoke.png"), full_page=True)
            print("OK: /vehicles validado con create+edit real y empty state de ultima ubicacion")
            print(f"Vehicle: {plate} ({vehicle_id})")
            print(f"Screenshot: {ARTIFACTS / 'vehicles-crud-smoke.png'}")
        finally:
            if not vehicle_id and token:
                vehicle = find_vehicle_by_plate(request_context, token, plate)
                if vehicle:
                    vehicle_id = vehicle["id"]
            if vehicle_id and token:
                api_json(request_context, "DELETE", f"/vehicles/{vehicle_id}", token=token, expected_status=204)

            browser.close()
            request_context.dispose()


if __name__ == "__main__":
    main()
