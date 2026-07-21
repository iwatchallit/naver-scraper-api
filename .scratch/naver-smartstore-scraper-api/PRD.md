# PRD: Naver SmartStore Scraper API

Source document: docs/Naver_SmartStore_Scraper_PRD_Engineering_Spec_v1.0.md

Summary:
- Build GET /naver API for SmartStore product URLs
- Capture raw JSON from benefits-by-product and product-details upstream APIs
- Use Playwright CDP with dedicated Chromium sidecar and KR proxy path
- Meet targets: average latency <= 6s, error rate <= 5%, support 1000+ products, 1-hour stable run
- Ship with readiness and metrics endpoints, benchmark evidence, and public test access

Use this file as the parent planning context for all issues in this folder.
