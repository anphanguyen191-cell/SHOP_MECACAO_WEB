# Shop Mẹ CaCao — Travel Luxe V2.0 owner acceptance

Date: 2026-10-17 (Asia/Ho_Chi_Minh)  
Branch: `main`  
Status: **Owner accepted as the official laptop UI baseline and authorized a one-pass update.**

## Owner acceptance

The shop owner explicitly instructed: “khắc phục toàn bộ ... đánh dấu mình đã nghiệm thu hết ... sau đó mình sẽ cập nhật đầy đủ về laptop một lượt để sử dụng chính thức.” This is recorded as owner acceptance of the completed baseline and authorization for the normal STABLE release workflow on `main`.

Accepted scope:

1. Resolve the 390 px floating action panel / bottom navigation collision and retain iPhone safe-area spacing.
2. Use one light-theme contrast system without position-based color blocks or thick colored card edges.
3. Give laptop workspaces task-specific introductions and clear journey cues, prioritizing Settings and multi-step work. The Cloud workspace design remains outside this acceptance because the owner has not finalized it.
4. Publish the resulting `main` commit through the existing single STABLE channel and make the running version/source commit visible in the update flow.
5. Treat the accepted commit as the baseline for the owner's single laptop update and subsequent operational feedback.

## Evidence and scope boundary

- This marker records the owner's explicit acceptance and release authorization; it does not claim the new build has already been installed or exercised on the shop laptop.
- The exact commit's GitHub Actions results remain the automated build, browser, Windows EXE and release evidence. CI is kept distinct from the upcoming real-laptop use check.
- Cloud authentication, sync, Supabase data and Cloud UI remain outside this laptop UI acceptance. No Cloud data or schema is changed by these UI updates.
- Any issue found during the owner's first laptop use is a correction against this accepted `main` baseline.
