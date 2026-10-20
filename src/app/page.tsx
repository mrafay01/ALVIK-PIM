// "/" shows the dashboard directly rather than redirecting to /dashboard,
// so opening the app is one request (200) instead of a 307 hop first.
export { default, dynamic } from "./dashboard/page";
