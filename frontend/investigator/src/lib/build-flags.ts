/**
 * Build-time flags. One module so a test can mock a flag and a reader can find every
 * place a static build differs from the live app.
 */

/** True when the build reads its data from the static export (VITE_STATIC=1): no
 *  backend, no Places. Statically replaced by Vite at build time. */
export const IS_STATIC_BUILD: boolean = import.meta.env.VITE_STATIC === "1";
