import { initClientDiagnosticsIfConsented } from "./src/lib/diagnostics";

// Browser diagnostics are opt-in. Nothing is initialised (and nothing is sent)
// unless the visitor previously allowed diagnostics; see src/lib/diagnostics.ts.
// Session replay is intentionally not enabled.
void initClientDiagnosticsIfConsented();
