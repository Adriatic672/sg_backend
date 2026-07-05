Here's the prompt:

Fix Flutter login redirect — goes to wrong screen after successful login

Project: Flutter app at c:\Users\Eddie\Documents\work2\socialgemsv1\socialgems_app_ke\social_gems

Problem: After a successful login (backend returns status 200 with JWT), the app does not go to /feedView. Instead it redirects to intermediate screens like /chooseIndustriesView, /congratulationsView, or /completeProfile.

Root cause: In lib/accounts/presentation/login_view.dart, on successful login (state.asData?.value == true), it calls getFirstPage() which has complex routing logic that checks industryIds, userType, contentFormView fields etc. These fields may be null/empty in the login response, causing wrong redirects.

What we want: If login succeeds (credentials correct, JWT received), always go to /feedView. No intermediate checks.

Files to change:

lib/accounts/presentation/login_view.dart

Find the getFirstPage() method (around line 83) — do not delete it, just stop calling it after normal login
In the ref.listen<AsyncValue>(loginControllerProvider, ...) block, find where getFirstPage() is called after LoadingScreen().hide() (around line 302-304) and replace with context.go('/feedView')
Also find _onEnableLocalAuth() method (around line 55) which also calls getFirstPage() at the end — replace that call with context.go('/feedView') too
Do not touch getFirstPage() itself — it may be used elsewhere (SSO login paths). Only replace the two call sites mentioned above.

Verify: After the change, a user with correct credentials should land on /feedView after login, regardless of whether their profile data is complete or not.


Z7O2qJ3kyg-AJvyOassbJRGOZonihIX8c_RgTzM794deYHLoPb