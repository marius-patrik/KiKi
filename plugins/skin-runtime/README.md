# skin-runtime

Runtime state, selection, and persistence primitives shared by Stack skins.

Declares `dsh.client` and provides its single instance as the cordis `skin`
service (`./client`). Consumers (`skin-host`, `skin-settings`) inject `skin`
rather than calling `createSkinRuntime` themselves, so the page has exactly
one active-skin state and one `localStorage`-unavailable fallback instead of
one per bundle it used to be inlined into.
