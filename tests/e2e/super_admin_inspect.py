from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = "http://localhost:5173/login"
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        page.on("console", lambda msg: print(f"console:{msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"pageerror: {err}"))

        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        page.wait_for_load_state("networkidle")

        print(f"url={page.url}")
        print(f"title={page.title()}")
        print("buttons=", page.locator("button").count())
        print("inputs=", page.locator("input").count())
        print("labels=", page.locator("label").count())
        print("headings=", page.locator("h1, h2, h3").all_inner_texts())
        print("body=", page.locator("body").inner_text(timeout=5000))

        page.screenshot(path=str(ARTIFACTS / "super-admin-login-inspect.png"), full_page=True)
        print(f"Screenshot: {ARTIFACTS / 'super-admin-login-inspect.png'}")

        browser.close()


if __name__ == "__main__":
    main()
