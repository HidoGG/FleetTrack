import os
from datetime import datetime, timedelta
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


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    driver_name = f"Codex QA Driver {stamp}"
    driver_email = f"codex.superadmin.qa.drivers.{stamp}@fleettrack.test"
    vehicle_plate = f"QA{stamp[-6:]}"
    license_number = f"LIC-{stamp[-8:]}"
    license_expiry = (datetime.now() + timedelta(days=120)).strftime("%Y-%m-%d")

    token = None
    company_id = None
    temp_profile_id = None
    vehicle_id = None
    driver_id = None

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

            auth_me = api_json(request_context, "GET", "/auth/me", token=token)
            company_id = auth_me.get("profile", {}).get("company_id")
            if not company_id:
                raise RuntimeError("El usuario QA no tiene company_id para validar /drivers")

            created_profile = api_json(
                request_context,
                "POST",
                f"/companies/{company_id}/profiles",
                token=token,
                data={
                    "email": driver_email,
                    "password": "Gabriel123!",
                    "role": "admin",
                    "full_name": driver_name,
                    "phone": "+54 9 299 555 0101",
                },
                expected_status=201,
            )
            temp_profile_id = created_profile["profile"]["id"]

            created_vehicle = api_json(
                request_context,
                "POST",
                "/vehicles",
                token=token,
                data={
                    "plate": vehicle_plate,
                    "brand": "QA",
                    "model": "Smoke",
                    "year": "2025",
                    "color": "Blanco",
                },
                expected_status=201,
            )
            vehicle_id = created_vehicle["id"]

            page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            page.locator('input[type="email"]').fill(SUPERADMIN_EMAIL)
            page.locator('input[type="password"]').fill(SUPERADMIN_PASSWORD)
            page.get_by_role("button", name="Ingresar al panel").click()

            page.wait_for_url(f"{BASE_URL}/dashboard", timeout=15000)
            page.wait_for_load_state("networkidle")
            page.get_by_test_id("sidebar-link-drivers").click()
            page.wait_for_url(f"{BASE_URL}/drivers", timeout=15000)
            page.wait_for_load_state("networkidle")

            page.get_by_test_id("drivers-new-button").click()
            expect(page.get_by_test_id("drivers-form")).to_be_visible(timeout=10000)

            page.get_by_test_id("drivers-profile-select").select_option(temp_profile_id)
            page.get_by_test_id("drivers-license-input").fill(license_number)
            page.get_by_test_id("drivers-expiry-input").fill(license_expiry)
            page.get_by_test_id("drivers-vehicle-select").select_option(vehicle_id)
            page.get_by_test_id("drivers-submit").click()

            row = page.locator("tbody tr").filter(has_text=driver_name).first
            expect(row).to_be_visible(timeout=15000)
            expect(row).to_contain_text(vehicle_plate)
            expect(row).to_contain_text(license_number)

            drivers = api_json(request_context, "GET", "/drivers", token=token)
            driver = next((item for item in drivers if item["profile_id"] == temp_profile_id), None)
            if not driver:
                raise RuntimeError("No se encontró el conductor QA recién creado por API")

            driver_id = driver["id"]

            page.screenshot(path=str(ARTIFACTS / "drivers-crud-smoke.png"), full_page=True)
            print("OK: /drivers validado con alta real de conductor")
            print(f"Profile: {driver_name} ({temp_profile_id})")
            print(f"Vehicle: {vehicle_plate} ({vehicle_id})")
            print(f"Driver: {driver_id}")
            print(f"Screenshot: {ARTIFACTS / 'drivers-crud-smoke.png'}")
        finally:
            if driver_id and token:
                api_json(request_context, "DELETE", f"/drivers/{driver_id}", token=token, expected_status=204)
            if vehicle_id and token:
                api_json(request_context, "DELETE", f"/vehicles/{vehicle_id}", token=token, expected_status=204)

            browser.close()
            request_context.dispose()


if __name__ == "__main__":
    main()
