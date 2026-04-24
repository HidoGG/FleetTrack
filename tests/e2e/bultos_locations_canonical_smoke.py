import os
import re
import time
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


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    location_name = f"Codex QA Bultos Location {stamp}"
    customer_name = f"Cliente Bultos {stamp}"
    location = None
    legacy_order = None
    canonical_order = None
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

            location = api_json(
                request_context,
                "POST",
                "/stores",
                token=superadmin_token,
                data={
                    "name": location_name,
                    "location_type": "branch",
                    "address": "QA canonical bultos",
                    "is_active": True,
                    "rider_visible": True,
                    "is_temporary": True,
                },
                expected_status=201,
            )

            legacy_order = api_json(
                request_context,
                "POST",
                "/orders",
                token=superadmin_token,
                data={
                    "store_id": location["id"],
                    "customer_name": f"{customer_name} Legacy",
                    "delivery_address": "Av. QA Legacy 123",
                    "payment_amount": 1200,
                },
                expected_status=201,
            )
            if legacy_order["store_id"] != location["id"] or legacy_order["location_id"] != location["id"]:
                raise RuntimeError("El pedido legacy no devolvio store_id/location_id normalizados")

            page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            page.locator('input[type="email"]').fill(SUPERADMIN_EMAIL)
            page.locator('input[type="password"]').fill(SUPERADMIN_PASSWORD)
            page.get_by_role("button", name="Ingresar al panel").click()

            page.wait_for_url(f"{BASE_URL}/dashboard", timeout=15000)
            page.wait_for_load_state("networkidle")
            page.get_by_test_id("sidebar-link-bultos").click()
            page.wait_for_url(f"{BASE_URL}/bultos", timeout=15000)
            page.wait_for_load_state("networkidle")

            page.get_by_test_id("bultos-tab-pedidos").click()
            canonical_card = page.get_by_text(re.compile(r"Ubicaciones can.nicas para pedidos"))
            expect(canonical_card).to_be_visible(timeout=15000)
            expect(page.locator(".badge", has_text="visibles riders")).to_have_count(1, timeout=15000)

            page.get_by_test_id("bultos-new-order-button").click()
            form = page.get_by_test_id("bultos-order-form")
            location_select = page.get_by_test_id("bultos-order-location-select")
            expect(location_select).to_be_enabled(timeout=10000)
            expect(location_select.locator(f"option[value='{location['id']}']")).to_contain_text(location_name, timeout=10000)

            location_select.select_option(location["id"])
            page.get_by_test_id("bultos-order-customer_name").fill(customer_name)
            page.get_by_test_id("bultos-order-delivery_address").fill("Av. QA Canonical 123")
            page.get_by_test_id("bultos-order-payment_amount").fill("1500")
            page.get_by_test_id("bultos-order-submit").click()

            page.wait_for_load_state("networkidle")

            canonical_order = None
            for _ in range(10):
                orders = api_json(
                    request_context,
                    "GET",
                    "/orders",
                    token=superadmin_token,
                )
                canonical_order = next((item for item in orders if item["customer_name"] == customer_name), None)
                if canonical_order:
                    break
                time.sleep(0.5)

            if not canonical_order:
                raise RuntimeError("No se encontro el pedido QA recien creado por API")
            if canonical_order["store_id"] != location["id"] or canonical_order["location_id"] != location["id"]:
                raise RuntimeError("El pedido canonico no devolvio store_id/location_id normalizados")

            filtered_by_location = api_json(
                request_context,
                "GET",
                f"/orders?location_id={location['id']}",
                token=superadmin_token,
            )
            filtered_by_store = api_json(
                request_context,
                "GET",
                f"/orders?store_id={location['id']}",
                token=superadmin_token,
            )
            legacy_ids = {item["id"] for item in filtered_by_location}
            store_ids = {item["id"] for item in filtered_by_store}
            expected_ids = {legacy_order["id"], canonical_order["id"]}
            if not expected_ids.issubset(legacy_ids):
                raise RuntimeError("GET /orders?location_id no devolvio ambos pedidos QA")
            if not expected_ids.issubset(store_ids):
                raise RuntimeError("GET /orders?store_id no devolvio ambos pedidos QA")

            row = page.locator("tbody tr").filter(has_text=customer_name).first
            expect(row).to_be_visible(timeout=15000)
            expect(row).to_contain_text(location_name)
            expect(row).to_contain_text("operativa")
            legacy_row = page.locator("tbody tr").filter(has_text=f"{customer_name} Legacy").first
            expect(legacy_row).to_be_visible(timeout=15000)
            expect(legacy_row).to_contain_text(location_name)

            page.screenshot(path=str(ARTIFACTS / "bultos-locations-canonical-smoke.png"), full_page=True)
            print("OK: /bultos validado con compatibilidad store_id/location_id para crear y listar pedidos")
            print(f"Location: {location_name} ({location['id']})")
            print(f"Legacy order: {legacy_order['id']}")
            print(f"Canonical order: {canonical_order['id']}")
            print(f"Screenshot: {ARTIFACTS / 'bultos-locations-canonical-smoke.png'}")
        finally:
            if canonical_order and superadmin_token:
                api_json(request_context, "DELETE", f"/orders/{canonical_order['id']}", token=superadmin_token, expected_status=204)
            if legacy_order and superadmin_token:
                api_json(request_context, "DELETE", f"/orders/{legacy_order['id']}", token=superadmin_token, expected_status=204)
            if location and superadmin_token:
                api_json(request_context, "DELETE", f"/stores/{location['id']}", token=superadmin_token, expected_status=204)

            browser.close()
            request_context.dispose()


if __name__ == "__main__":
    main()
