import os
import re
from datetime import datetime
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://localhost:5173")
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3001/api")
SUPERADMIN_EMAIL = "gabriel@gabriel.com"
SUPERADMIN_PASSWORD = "Gabriel123!"
STORE_PASSWORD = "Gabriel123!"
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


def wait_for_unread_alerts(page, total: int) -> None:
    alert_button = page.get_by_role("button", name=re.compile("Alertas"))
    expect(alert_button.get_by_text(str(total), exact=True)).to_be_visible(timeout=15000)


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    store_email = f"codex.superadmin.qa.store.rt.{stamp}@example.com"
    store_full_name = f"Codex QA Store RT {stamp}"
    location_name = f"Codex QA Location RT {stamp}"
    location = None
    legacy_order = None
    canonical_order = None

    with sync_playwright() as p:
        request_context = p.request.new_context()
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        superadmin_token = None

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
                    "address": "QA realtime bridge",
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
                    "password": STORE_PASSWORD,
                    "role": "store",
                    "full_name": store_full_name,
                    "store_id": location["id"],
                },
                expected_status=201,
            )

            store_login = api_json(
                request_context,
                "POST",
                "/auth/login",
                data={"email": store_email, "password": STORE_PASSWORD},
            )
            if store_login["user"]["profile"].get("location_id") != location["id"]:
                raise RuntimeError("El perfil store creado con store_id legacy no devolvio location_id normalizado")

            legacy_order = api_json(
                request_context,
                "POST",
                "/orders",
                token=superadmin_token,
                data={
                    "store_id": location["id"],
                    "customer_name": f"Cliente RT Legacy {stamp}",
                    "delivery_address": "Av. QA Legacy 123",
                    "notes": "Smoke bridge realtime legacy",
                },
                expected_status=201,
            )
            if legacy_order["location_id"] != location["id"]:
                raise RuntimeError("El pedido legacy no devolvio location_id normalizado")

            canonical_order = api_json(
                request_context,
                "POST",
                "/orders",
                token=superadmin_token,
                data={
                    "location_id": location["id"],
                    "customer_name": f"Cliente RT {stamp}",
                    "delivery_address": "Av. QA 123",
                    "notes": "Smoke bridge realtime location/store",
                },
                expected_status=201,
            )
            if canonical_order["store_id"] != location["id"] or canonical_order["location_id"] != location["id"]:
                raise RuntimeError("El pedido canonico no devolvio alias location/store consistente")

            page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            page.locator('input[type="email"]').fill(store_email)
            page.locator('input[type="password"]').fill(STORE_PASSWORD)
            page.get_by_role("button", name="Ingresar al panel").click()

            page.wait_for_url(f"{BASE_URL}/store/dashboard", timeout=15000)
            page.wait_for_load_state("networkidle")

            expect(page.get_by_role("heading", name="Mis pedidos")).to_be_visible(timeout=15000)
            expect(page.get_by_text("Pendientes de Carga")).to_be_visible(timeout=15000)
            expect(page.get_by_text(legacy_order["customer_name"])).to_be_visible(timeout=15000)
            expect(page.get_by_text(canonical_order["customer_name"])).to_be_visible(timeout=15000)

            api_json(
                request_context,
                "PATCH",
                f"/orders/{canonical_order['id']}/ready",
                token=superadmin_token,
            )
            wait_for_unread_alerts(page, 1)

            api_json(
                request_context,
                "PUT",
                f"/orders/{canonical_order['id']}/status",
                token=superadmin_token,
                data={"status": "ACCEPTED"},
            )
            wait_for_unread_alerts(page, 2)

            api_json(
                request_context,
                "PUT",
                f"/orders/{canonical_order['id']}/status",
                token=superadmin_token,
                data={"status": "DELIVERED"},
            )
            wait_for_unread_alerts(page, 3)

            page.get_by_role("button", name=re.compile("Alertas")).click()
            expect(page.get_by_text("Pedido listo para retiro", exact=True)).to_have_count(1, timeout=15000)
            expect(page.get_by_text("Pedido aceptado", exact=True)).to_have_count(1, timeout=15000)
            expect(page.get_by_text("Entregado al cliente", exact=True)).to_have_count(1, timeout=15000)

            page.screenshot(path=str(ARTIFACTS / "store-realtime-bridge-smoke.png"), full_page=True)
            print("OK: portal de despacho validado con compatibilidad store_id/location_id y eventos realtime duales")
            print(f"Store profile: {store_email}")
            print(f"Location: {location_name} ({location['id']})")
            print(f"Legacy order: {legacy_order['id']}")
            print(f"Canonical order: {canonical_order['id']}")
            print(f"Screenshot: {ARTIFACTS / 'store-realtime-bridge-smoke.png'}")
        finally:
            if canonical_order and superadmin_token:
                api_json(
                    request_context,
                    "DELETE",
                    f"/orders/{canonical_order['id']}",
                    token=superadmin_token,
                    expected_status=204,
                )
            if legacy_order and superadmin_token:
                api_json(
                    request_context,
                    "DELETE",
                    f"/orders/{legacy_order['id']}",
                    token=superadmin_token,
                    expected_status=204,
                )
            if location and superadmin_token:
                api_json(
                    request_context,
                    "DELETE",
                    f"/stores/{location['id']}",
                    token=superadmin_token,
                    expected_status=204,
                )

            browser.close()
            request_context.dispose()


if __name__ == "__main__":
    main()
