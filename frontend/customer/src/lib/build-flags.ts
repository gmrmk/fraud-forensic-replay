/** True when the build reads its data from the static export (VITE_STATIC=1): no backend.
 *  Statically replaced by Vite at build time. Twin of the investigator's build-flags. */
export const IS_STATIC_BUILD: boolean = import.meta.env.VITE_STATIC === "1";
