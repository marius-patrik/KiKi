// jscpd:ignore-start -- hand-authored UI bundle; tracked for full one-concern-per-file decomposition in issue #40
// tweaks client half (hand-authored bundle): owns the replaced
// web-profile settings shell.
//
//   (The sidebar occupant that used to live here was removed: @dsh-stack/
//     sidebar-shell is the canonical declarer of the `sidebar` slot and its
//     children, and two entries may not declare the same child slot. Keeping
//     both made the client loader throw `slot "sidebar.workspaces" is already
//     declared` and the whole web UI failed to boot.)
//   sidebar.settings occupant (TweaksSettingsRoot) — replaces
//     ui-settings-general. Trigger row + modal panel (1080x700 figma),
//     section nav rail, onboarding coordinator, and the new
//     settings.section.icon seat (glyphs registered by section id, with the
//     shell's gear fallback while a section owns no glyph). Every section
//     receives an extra `openSection` owner prop (harness sections ignore it)
//     so later phases can navigate across sections.
//   ownerless Settings copy — re-registers the trigger/header/close chrome,
//     the General section, the loopback-only open-document action, and the
//     `sidebar` + `settings` dictionaries, since ui-sidebar and
//     ui-settings-general are disabled in the web profile patch.
//   settings.onboarding "welcome-notice" override (TweaksWelcomeNoticeOverride)
//     — shadows client-ui-settings-models' own WelcomeNotice entry so the
//     General section's "Internal Testing Notice" toggle actually gates it,
//     and persists its own acknowledgement to localStorage so dismissal
//     survives reload for a remote (non-loopback) browser too, instead of
//     the harness store's loopback-only durable / remote memory-only split.
//
// The shell CSS ships as a claimed <style> block (prefixed class names); the
// module system's claimStyles machinery owns untagged <style> tags injected
// during materialization. Only platform seed words are required (react,
// ui-primitives, ui-slots) — no cross-package value imports, no
// dsh-client-runtime/client, so the document action re-implements its state
// as a hand-rolled observable over the connection api. The uSES selector
// bridge (bindSnapshotSelector) is inlined locally too: harness merged the
// package that used to export it (@deepseek-ai/dsh-client-web-react) into
// dsh-client-ui-renderer without re-exporting the helper publicly, so this
// file carries its own copy over React's built-in useSyncExternalStore
// rather than depend on an internal harness path.
//
// Re-running the bundle (HMR / entry refresh) is idempotent through the slot
// ledger and the style-tag guard.

const SHELL_CSS = `
.dsh-tw-root {
  --dsh-sidebar-inline-padding: 12px;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 6px var(--dsh-sidebar-inline-padding);
  box-sizing: border-box;
  background: var(--dsw-specific-sidebar-fill);
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.dsh-tw-root.dsh-tw-collapsed { padding: 18px 10px 6px; }
.dsh-tw-root.dsh-tw-quietBars { --dsh-scrollbar-thumb: transparent; --dsh-scrollbar-thumb-hover: transparent; }
.dsh-tw-fading > * { opacity: 0; transition: opacity 150ms var(--ds-ease-in-out); }
.dsh-tw-wide { animation: dsh-tw-wide-in 200ms var(--ds-ease-in-out); }
@keyframes dsh-tw-wide-in { from { opacity: 0; } }
.dsh-tw-railIn .dsh-tw-iconButton,
.dsh-tw-railIn .dsh-tw-newSession,
.dsh-tw-railIn .dsh-tw-regionArea { animation: dsh-tw-rail-in 150ms var(--ds-ease-in-out) backwards; }
.dsh-tw-railIn .dsh-tw-footArea { animation: dsh-tw-rail-fade-in 150ms var(--ds-ease-in-out) backwards; }
@keyframes dsh-tw-rail-in { from { opacity: 0; transform: translateX(49px); } }
@keyframes dsh-tw-rail-fade-in { from { opacity: 0; } }
.dsh-tw-logoRow { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 8px; height: 60px; padding: 8px 0 8px 4px; margin-bottom: 8px; box-sizing: border-box; overflow: hidden; }
.dsh-tw-collapsed .dsh-tw-logoRow { height: 36px; padding: 0; margin-bottom: 12px; justify-content: flex-start; }
.dsh-tw-brand { flex: 1; min-width: 0; display: inline-flex; align-items: center; overflow: hidden; padding: 0; border: none; background: transparent; color: inherit; cursor: pointer; }
.dsh-tw-iconButton { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; border-radius: 50%; padding: 0; background: transparent; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.dsh-tw-iconButton:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tw-collapsed .dsh-tw-iconButton { width: 36px; height: 36px; }
.dsh-tw-collapsed .dsh-tw-toggle .dsh-tw-panelIcon { display: none; }
.dsh-tw-collapsed .dsh-tw-toggle:hover .dsh-tw-panelIcon { display: inline; }
.dsh-tw-collapsed .dsh-tw-toggle:hover .dsh-tw-railFish { display: none; }
.dsh-tw-collapsed .dsh-tw-iconButton { color: var(--dsw-alias-label-primary); }
.dsh-tw-newSession { flex: none; display: flex; align-items: center; justify-content: center; gap: 6px; height: 38px; padding: 8px 16px; margin: 0 2px 8px; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-button-elevated-fill); color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 500; line-height: 22px; cursor: pointer; overflow: hidden; }
.dsh-tw-newSession:hover { background: var(--dsw-alias-button-floating-hover); }
.dsh-tw-collapsed .dsh-tw-newSession { align-self: flex-start; width: 36px; height: 36px; padding: 0; margin: 0 0 12px; gap: 0; border-color: transparent; background: transparent; }
.dsh-tw-collapsed .dsh-tw-newSession:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tw-newSessionLabel { max-width: 200px; overflow: hidden; white-space: nowrap; }
.dsh-tw-collapsed .dsh-tw-newSessionLabel { max-width: 0; }
.dsh-tw-regionArea { flex: 1; min-height: 0; display: flex; flex-direction: column; margin-left: -4px; margin-right: calc(-1 * var(--dsh-sidebar-inline-padding)); padding-left: 4px; overflow: hidden; }
.dsh-tw-collapsed .dsh-tw-regionArea { margin-left: 0; margin-right: 0; padding-left: 0; }
.dsh-tw-historyArea { flex: none; min-width: 0; width: 100%; }
.dsh-tw-historySection { padding: 0 4px 8px; }
.dsh-tw-historyHeader { height: 28px; padding: 0 8px; display: flex; align-items: center; }
.dsh-tw-historyLabel { font-size: 11px; color: var(--dsw-alias-label-tertiary); text-transform: uppercase; letter-spacing: 0.5px; }
.dsh-tw-historyList { display: flex; flex-direction: column; gap: 1px; }
.dsh-tw-historyRow { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; cursor: pointer; min-height: 28px; }
.dsh-tw-historyRow:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tw-historyTitle { flex: 1; font-size: 13px; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-tw-historyTime { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.dsh-tw-footArea { flex: none; display: flex; flex-direction: column; gap: 2px; }
.dsh-tw-settingsArea { flex: none; display: flex; align-items: center; justify-content: flex-start; padding: 2px 4px; }
.dsh-tw-footerActions { flex: none; min-width: 0; width: 100%; display: flex; flex-direction: column; gap: 2px; }
.dsh-tw-collapsed .dsh-tw-footArea { align-items: center; gap: 4px; }
.dsh-tw-collapsed .dsh-tw-settingsArea,
.dsh-tw-collapsed .dsh-tw-footerActions { display: flex; flex-direction: column; align-items: center; justify-content: center; width: auto; gap: 4px; padding: 0; }
.dsh-tw-trigger { flex: none; display: flex; align-items: center; gap: 8px; width: 100%; height: 34px; margin: 2px 0; padding: 6px 10px; box-sizing: border-box; border: none; border-radius: 10px; background: transparent; cursor: pointer; overflow: hidden; color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 13.5px; line-height: 20px; font-weight: 500; user-select: none; transition: background 120ms ease; }
.dsh-tw-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tw-trigger.dsh-tw-rail { width: 36px; height: 36px; margin: 4px 0; justify-content: center; gap: 0; padding: 0; border-radius: 50%; }
.dsh-tw-overlay { position: fixed; inset: 0; z-index: 1000000; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.dsh-tw-mask { position: absolute; inset: 0; background: transparent !important; backdrop-filter: none !important; pointer-events: auto; }
.dsh-tw-panel { position: relative; z-index: 1; pointer-events: auto; display: flex; flex-direction: row; min-width: 480px; min-height: 340px; border-radius: 24px; overflow: hidden; background: var(--dsw-alias-bg-layer-2); box-shadow: 0 24px 64px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.14) !important; border: 1.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.22)) !important; --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }
:root[data-theme="oled"] .dsh-tw-panel, body[data-theme="oled"] .dsh-tw-panel { background: #050505 !important; border: 1.5px solid #333333 !important; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.95), 0 0 0 1px #222222 !important; }
.dsh-tw-welcomeNotice { position: relative; z-index: 1; pointer-events: auto; display: flex; flex-direction: column; gap: 14px; width: 420px; max-width: calc(100vw - 48px); padding: 24px; box-sizing: border-box; border-radius: 20px; background: var(--dsw-alias-bg-layer-2); box-shadow: 0 24px 64px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.14) !important; border: 1.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.22)) !important; }
.dsh-tw-welcomeNoticeTitle { margin: 0; font-size: 16px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dsh-tw-welcomeNoticeBody { margin: 0; font-size: 13.5px; line-height: 20px; color: var(--dsw-alias-label-secondary); white-space: pre-line; }
.dsh-tw-welcomeNoticeActions { display: flex; justify-content: flex-end; }
.dsh-tw-welcomeNoticeButton { border: none; border-radius: 10px; padding: 8px 18px; background: var(--dsw-alias-primary, #6366f1); color: #fff; font-size: 13.5px; font-weight: 500; cursor: pointer; }
.dsh-tw-nav { position: relative; flex: none; display: flex; flex-direction: column; gap: 14px; width: 192px; min-width: 56px; max-width: 380px; height: 100%; padding: 18px 10px 0; box-sizing: border-box; border-right: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.12)); transition: width 80ms ease; user-select: none; overflow: hidden; }
.dsh-tw-nav.dsh-tw-navCollapsed { width: 56px !important; padding: 18px 6px 0; }
.dsh-tw-nav.dsh-tw-navCollapsed .dsh-tw-navLabel { display: none; }
.dsh-tw-nav.dsh-tw-navCollapsed .dsh-tw-navGroupHeader { display: none; }
.dsh-tw-nav.dsh-tw-navCollapsed .dsh-tw-navTitle { display: none; }
.dsh-tw-navResizer { position: absolute; top: 0; right: -4px; bottom: 0; width: 8px; cursor: col-resize; z-index: 10; }
.dsh-tw-navResizer:hover, .dsh-tw-navResizer.dsh-tw-resizing { background: var(--dsw-alias-primary, #6366f1); opacity: 0.4; }
.dsh-tw-draggableHeader { cursor: grab; user-select: none; }
.dsh-tw-draggableHeader:active { cursor: grabbing; }
.dsh-tw-navTitleRow { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 0 8px; }
.dsh-tw-navTitle { font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-tw-navCollapseBtn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsh-tw-navCollapseBtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-tw-navList { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 3px; overflow-y: auto; padding-bottom: 12px; }
.dsh-tw-navCell { display: flex; align-items: center; gap: 8px; height: 38px; padding: 8px 12px; box-sizing: border-box; border: none; border-radius: 10px; background: transparent; cursor: pointer; font-family: inherit; font-size: 14px; line-height: 22px; font-weight: 400; color: var(--dsw-alias-label-primary); text-align: left; transition: background 100ms; }
.dsh-tw-navCell:hover { background: var(--dsw-specific-sidebar-nav-item-hover); }
.dsh-tw-navCell.dsh-tw-active { background: var(--dsw-specific-sidebar-nav-item-active); }
.dsh-tw-navIcon { flex: none; display: inline-flex; align-items: center; justify-content: center; }
.dsh-tw-navLabel { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dsh-tw-content { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.dsh-tw-header { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; height: 54px; padding: 20px 14px 8px 10px; box-sizing: border-box; }
.dsh-tw-actions { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-left: auto; }
.dsh-tw-close { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: none; border-radius: 28px; background: transparent; cursor: pointer; color: var(--dsw-alias-label-primary); }
.dsh-tw-close:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-tw-options { flex: 1; min-height: 0; height: 100%; padding: 0 24px 24px; overflow-y: auto; }
.dsh-tw-hiddenLabel { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.dsh-tw-section { display: flex; flex-direction: column; width: 100%; }
.dsh-tw-section > [data-slot='settings.general.item'] > :last-child { border-bottom: none; }
/* Universal Animated Lucide Icons */
svg:not([class*="badge"]),
.dsh-icon-animated {
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), stroke 180ms ease, fill 180ms ease, opacity 180ms ease !important;
  transform-origin: center center;
}

button:hover svg:not([class*="badge"]),
a:hover svg:not([class*="badge"]),
[role="button"]:hover svg:not([class*="badge"]),
[role="menuitem"]:hover svg:not([class*="badge"]),
[role="tab"]:hover svg:not([class*="badge"]),
.dsh-tw-trigger:hover svg:not([class*="badge"]),
.dsh-tree-projectRow:hover svg:not([class*="badge"]),
.dsh-tree-sessionRow:hover svg:not([class*="badge"]) {
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), stroke 180ms ease, fill 180ms ease !important;
}

/* Refresh / Sync / Reload */
button:hover svg[class*="refresh"], button:hover svg[class*="reload"], button:hover svg[class*="loop"],
button:hover .dsh-icon-refresh, .dsh-icon-refresh:hover, [role="button"]:hover svg[class*="refresh"] {
  transform: rotate(180deg) !important;
}

/* Trash / Delete */
button:hover svg[class*="trash"], button:hover svg[class*="delete"],
button:hover .dsh-icon-trash, .dsh-icon-trash:hover, [role="button"]:hover svg[class*="trash"] {
  transform: rotate(-15deg) !important;
}

/* Edit / Pencil */
button:hover svg[class*="edit"], button:hover svg[class*="pencil"],
button:hover .dsh-icon-edit, .dsh-icon-edit:hover, [role="button"]:hover svg[class*="edit"] {
  transform: rotate(-15deg) !important;
}

/* Plus / Add / New */
button:hover svg[class*="plus"], button:hover svg[class*="add"],
button:hover .dsh-icon-plus, .dsh-icon-plus:hover, [role="button"]:hover svg[class*="plus"] {
  transform: rotate(90deg) !important;
}

/* Pin */
button:hover svg[class*="pin"], .dsh-tree-sessionRow:hover svg[class*="pin"],
button:hover .dsh-icon-pin, .dsh-icon-pin:hover, [role="button"]:hover svg[class*="pin"] {
  transform: rotate(-18deg) !important;
}

/* Search */
button:hover svg[class*="search"], button:hover .dsh-icon-search, .dsh-icon-search:hover, [role="button"]:hover svg[class*="search"] {
  transform: rotate(-12deg) !important;
}

/* Settings / Sliders / Gear */
button:hover svg[class*="setting"], button:hover svg[class*="gear"], button:hover svg[class*="slider"],
button:hover .dsh-icon-sliders, button:hover .dsh-icon-settings, .dsh-icon-sliders:hover, .dsh-icon-settings:hover, [role="button"]:hover svg[class*="setting"], .dsh-tw-trigger:hover .dsh-icon-settings {
  transform: rotate(45deg) !important;
}

/* Terminal / Code / Prompt */
button:hover svg[class*="terminal"], button:hover svg[class*="code"], .dsh-tree-sessionRow:hover svg[class*="terminal"],
button:hover .dsh-icon-terminal, .dsh-icon-terminal:hover, [role="button"]:hover svg[class*="terminal"] {
  transform: translateX(2px) !important;
}

/* Folder */
button:hover svg[class*="folder"], .dsh-tree-projectRow:hover svg[class*="folder"],
button:hover .dsh-icon-folder, .dsh-icon-folder:hover, [role="button"]:hover svg[class*="folder"] {
  transform: translateY(-1.5px) !important;
}

/* Containers / Box / Cube */
button:hover svg[class*="container"], button:hover svg[class*="box"], button:hover svg[class*="cube"],
button:hover .dsh-icon-containers, .dsh-icon-containers:hover, [role="button"]:hover svg[class*="container"] {
  transform: translateY(-1.5px) !important;
}

/* Chat / Conversation / Message */
button:hover svg[class*="chat"], button:hover svg[class*="message"], .dsh-tree-sessionRow:hover svg[class*="chat"],
button:hover .dsh-icon-chat, .dsh-icon-chat:hover, [role="button"]:hover svg[class*="chat"] {
  transform: translateY(-1px) !important;
}

/* Mic / Voice */
button:hover svg[class*="mic"], button:hover svg[class*="voice"], button:hover svg[class*="audio"],
button:hover .dsh-icon-mic, .dsh-icon-mic:hover, [role="button"]:hover svg[class*="mic"] {
  transform: translateY(-1px) !important;
}

/* Dock / Panel Toggle */
button:hover svg[class*="dock"], button:hover svg[class*="panel"],
button:hover .dsh-icon-dock, .dsh-icon-dock:hover, [role="button"]:hover svg[class*="dock"] {
  transform: translateX(1.5px) !important;
}

/* Branch / Git */
button:hover svg[class*="branch"], button:hover svg[class*="git"],
button:hover .dsh-icon-branch, .dsh-icon-branch:hover, [role="button"]:hover svg[class*="branch"] {
  transform: rotate(15deg) !important;
}

/* Eye / Preview */
button:hover svg[class*="eye"], button:hover svg[class*="view"],
button:hover .dsh-icon-eye, .dsh-icon-eye:hover, [role="button"]:hover svg[class*="eye"] {
  transform: translateY(-1px) !important;
}

/* Copy */
button:hover svg[class*="copy"], button:hover .dsh-icon-copy, .dsh-icon-copy:hover, [role="button"]:hover svg[class*="copy"] {
  transform: translateY(-1px) !important;
}

/* Cut / Scissors */
button:hover svg[class*="cut"], button:hover svg[class*="scissors"], button:hover .dsh-icon-cut, .dsh-icon-cut:hover, [role="button"]:hover svg[class*="cut"] {
  transform: rotate(-15deg) !important;
}

/* Ellipsis / More */
button:hover svg[class*="ellipsis"], button:hover svg[class*="more"], button:hover .dsh-icon-ellipsis, .dsh-icon-ellipsis:hover, [role="button"]:hover svg[class*="ellipsis"] {
  transform: rotate(90deg) !important;
}

/* Chevron / Arrow */
.dsh-tree-projectRow:hover .dsh-tree-arrow, .dsh-tree-projectRow:hover svg[class*="chevron"], .dsh-tree-projectRow:hover svg[class*="arrow"] {
  transform: translateX(1.5px) !important;
}
.dsh-tree-projectRow:hover .dsh-tree-arrowOpen {
  transform: rotate(90deg) translateY(-1px) !important;
}
[class*="inputRow"] {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  min-height: 40px !important;
  height: auto !important;
  padding: 0 4px !important;
}
[class*="inputRow"] > button[class*="add"] {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 34px !important;
  height: 34px !important;
  min-height: 34px !important;
  max-height: 34px !important;
  align-self: center !important;
  margin: 0 !important;
  padding: 0 !important;
  flex: none !important;
}
[class*="sendGroup"] {
  display: flex !important;
  align-items: center !important;
  align-self: center !important;
  margin: 0 !important;
  padding: 0 !important;
  flex: none !important;
}
[class*="sendGroup"] button[class*="primary"],
[class*="sendGroup"] button {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 34px !important;
  height: 34px !important;
  min-height: 34px !important;
  max-height: 34px !important;
  margin: 0 !important;
  padding: 0 !important;
}
[class*="inputRow"] [class*="scroll"] {
  display: flex !important;
  align-items: center !important;
  min-height: 34px !important;
  flex: 1 !important;
  margin: 0 !important;
  padding: 0 !important;
}
[class*="inputRow"] [class*="grow"] {
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  min-height: 24px !important;
  margin: 0 !important;
  padding: 0 !important;
}
[class*="inputRow"] textarea[class*="input"],
[class*="inputRow"] [class*="backdrop"],
[class*="inputRow"] [class*="mirror"] {
  padding: 2px 10px !important;
  font-size: 14px !important;
  line-height: 20px !important;
  min-height: 24px !important;
  box-sizing: border-box !important;
  margin: 0 !important;
}
[data-slot="conversation.session.header.actions"] [data-slot-id="agent-preset"],
[data-slot="conversation.session.header.actions"] > div:has([class*="agentPreset"]),
[data-slot="conversation.session.header.actions"] > div:has([class*="preset"]),
[data-slot="conversation.session.header.actions"] > [class*="agentPreset"],
[data-slot="conversation.session.header.actions"] > [class*="preset"],
[class*="headerActions"] [class*="preset"],
[class*="headerActions"] [class*="AgentPreset"],
[class*="headerActions"] [class*="agentPreset"],
[class*="conversationSessionHeader"] [class*="preset"],
[class*="conversationSessionHeader"] [class*="AgentPreset"],
[class*="conversationSessionHeader"] [class*="agentPreset"],
div[class*="AgentPresetLabel"],
button[class*="AgentPresetLabel"] {
  display: none !important;
}
/* Hide header subagent catalog from session header actions */
[data-slot="conversation.session.header.actions"] [data-slot-entry="subagent-catalog"],
[data-slot="conversation.session.header.actions"] [data-slot-id="subagent-catalog"],
[class*="headerActions"] [class*="SubagentCatalog"],
[class*="headerActions"] [class*="subagent"] {
  display: none !important;
}

/* Hide default conversation header view tabs (Chat / Trajectory tablist) */
[class*="tabs"][role="tablist"],
[class*="tabs"][class*="header"],
div[data-slot="conversation.session.header.tabs"],
div[data-slot-entry="tabs"],
div[data-slot-id="tabs"],
[class*="conversationSessionHeader"] [role="tablist"],
[class*="headerActions"] [role="tablist"] {
  display: none !important;
}

/* Agent / Assistant Message Bubbles: Distinct Blurple Surface & Border */
div[data-slot="conversation.message.turn"]:has([data-message-role="assistant"]),
div[class*="messageTurn"]:has([data-message-role="assistant"]),
div[class*="MessageTurn"]:has([data-message-role="assistant"]),
div[class*="messageWrapper"][data-role="assistant"],
div[data-slot="conversation.message.assistant"] {
  align-self: flex-start !important;
  max-width: 90% !important;
}

[data-message-role="assistant"] > div[class*="content"],
[data-message-role="assistant"] [class*="Message_bubble"],
[data-message-role="assistant"] [class*="bubble"],
[data-slot="conversation.message.assistant"] [class*="content"],
[class*="AssistantMarkdown_root"],
[class*="AssistantNodeView"] {
  background: rgba(99, 102, 241, 0.14) !important;
  border: 1.5px solid rgba(99, 102, 241, 0.38) !important;
  border-radius: 20px !important;
  padding: 14px 18px !important;
  box-shadow: 0 2px 12px rgba(99, 102, 241, 0.08) !important;
  color: var(--dsw-alias-label-primary) !important;
  align-self: flex-start !important;
  max-width: 88% !important;
}

[data-message-role="user"] > div[class*="content"],
[data-message-role="user"] [class*="Message_bubble"],
[data-message-role="user"] [class*="bubble"],
[data-slot="conversation.message.user"] [class*="content"],
[class*="MessageItem_userRow"] [class*="bubble"],
[class*="userRow"] [class*="bubble"],
[class*="userStack"] [class*="bubble"] {
  background: var(--dsw-specific-user-bubble, var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.08))) !important;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.18)) !important;
  border-radius: 20px !important;
  padding: 12px 18px !important;
  color: var(--dsw-alias-label-primary) !important;
  align-self: flex-end !important;
  max-width: 82% !important;
}

/* Floating Input Bar Capsule Bubble */
[class*="InputBar_card"],
[class*="inputBar_card"],
[class*="InputBar_root"] [class*="card"],
div[data-conversation-composer-card],
div[class*="composerCard"] {
  border-radius: 22px !important;
  background: var(--dsw-specific-input-major, var(--dsw-alias-surface-l1, #181825)) !important;
  border: 1.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14)) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25) !important;
}

/* OLED theme rules for message bubbles, user bubbles, and goal display */
:root[data-theme="oled"],
body[data-theme="oled"],
[data-theme="oled"] {
  --dsw-specific-input-major: #080808 !important;
  --dsw-specific-tip: #000000 !important;
  --dsw-alias-surface-l0: #000000 !important;
  --dsw-alias-surface-l1: #050505 !important;
  --dsw-alias-surface-l2: #0a0a0a !important;
  --dsw-alias-bg-base: #000000 !important;
  --dsw-alias-bg-layer-1: #000000 !important;
  --dsw-alias-bg-layer-2: #050505 !important;
  --dsw-alias-border-l1: #161616 !important;
  --dsw-alias-border-l2: #1e1e1e !important;
  --dsw-alias-border-l2-darkmode-thin: #1a1a1a !important;
  --dsw-specific-bubble: rgba(99, 102, 241, 0.12) !important;
  --dsw-specific-user-bubble: #0f0f0f !important;
  --dsw-specific-bubble-highlight: #141414 !important;
}

:root[data-theme="oled"] [data-message-role="assistant"] > div[class*="content"],
:root[data-theme="oled"] [data-message-role="assistant"] [class*="Message_bubble"],
:root[data-theme="oled"] [data-message-role="assistant"] [class*="bubble"],
:root[data-theme="oled"] [data-slot="conversation.message.assistant"] [class*="content"],
:root[data-theme="oled"] [class*="AssistantMarkdown_root"],
:root[data-theme="oled"] [class*="AssistantNodeView"],
body[data-theme="oled"] [data-message-role="assistant"] > div[class*="content"],
body[data-theme="oled"] [data-message-role="assistant"] [class*="Message_bubble"],
body[data-theme="oled"] [data-message-role="assistant"] [class*="bubble"],
body[data-theme="oled"] [data-slot="conversation.message.assistant"] [class*="content"],
body[data-theme="oled"] [class*="AssistantMarkdown_root"],
body[data-theme="oled"] [class*="AssistantNodeView"] {
  background: rgba(99, 102, 241, 0.12) !important;
  border: 1.5px solid rgba(99, 102, 241, 0.32) !important;
  box-shadow: 0 0 16px rgba(99, 102, 241, 0.06) !important;
}

:root[data-theme="oled"] [data-message-role="user"] > div[class*="content"],
:root[data-theme="oled"] [data-message-role="user"] [class*="Message_bubble"],
:root[data-theme="oled"] [data-message-role="user"] [class*="bubble"],
:root[data-theme="oled"] [data-slot="conversation.message.user"] [class*="content"],
:root[data-theme="oled"] [class*="MessageItem_userRow"] [class*="bubble"],
:root[data-theme="oled"] [class*="userRow"] [class*="bubble"],
:root[data-theme="oled"] [class*="userStack"] [class*="bubble"],
body[data-theme="oled"] [data-message-role="user"] > div[class*="content"],
body[data-theme="oled"] [data-message-role="user"] [class*="Message_bubble"],
body[data-theme="oled"] [data-message-role="user"] [class*="bubble"],
body[data-theme="oled"] [data-slot="conversation.message.user"] [class*="content"],
body[data-theme="oled"] [class*="MessageItem_userRow"] [class*="bubble"],
body[data-theme="oled"] [class*="userRow"] [class*="bubble"],
body[data-theme="oled"] [class*="userStack"] [class*="bubble"] {
  background: #0f0f0f !important;
  border-color: #222222 !important;
  box-shadow: none !important;
}

:root[data-theme="oled"] [class*="InputBar_card"],
:root[data-theme="oled"] [class*="inputBar_card"],
:root[data-theme="oled"] [class*="InputBar_root"] [class*="card"],
body[data-theme="oled"] [class*="InputBar_card"],
body[data-theme="oled"] [class*="inputBar_card"],
body[data-theme="oled"] [class*="InputBar_root"] [class*="card"] {
  background: #080808 !important;
  border: 1.5px solid #222222 !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6) !important;
}

:root[data-theme="oled"] [data-goal-bar],
:root[data-theme="oled"] [data-goal-bar] > div,
:root[data-theme="oled"] [class*="GoalBar"],
:root[data-theme="oled"] [class*="goal-bar"],
:root[data-theme="oled"] [class*="goalDisplay"],
:root[data-theme="oled"] [class*="GoalDisplay"],
:root[data-theme="oled"] [class*="AgentGoal"],
:root[data-theme="oled"] [class*="agentGoal"],
body[data-theme="oled"] [data-goal-bar],
body[data-theme="oled"] [data-goal-bar] > div,
body[data-theme="oled"] [class*="GoalBar"],
body[data-theme="oled"] [class*="goal-bar"],
body[data-theme="oled"] [class*="goalDisplay"],
body[data-theme="oled"] [class*="GoalDisplay"],
body[data-theme="oled"] [class*="AgentGoal"],
body[data-theme="oled"] [class*="agentGoal"] {
  background: #000000 !important;
  border-color: #1a1a1a !important;
  box-shadow: none !important;
}

.dsh-subagent-dock-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08)) !important;
}
.dsh-header-ellipsis-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08)) !important;
  color: var(--dsw-alias-label-primary) !important;
}
/* Main sidebar on the right: the shell grid's three tracks are re-ordered so
   the secondary dock's width leads and the main sidebar's width trails. Both
   track sizes come from variables the client publishes from the live layout
   (--dsh-main-sidebar-width mirrors the harness's own first track; see
   trackMainSidebarWidth), never from a guessed constant, so a track and the
   column sitting in it can never disagree about how wide the sidebar is. */
body.dsh-main-sidebar-right [class*="frame"] {
  grid-template-columns: var(--dsh-secondary-sidebar-width, 0px) minmax(0, 1fr) var(--dsh-main-sidebar-width, 240px) !important;
}
/* The three shell columns are ordinary static grid children: grid placement
   moves them, and the track owns the width. Restating the width on the child
   is what lets it outgrow its track and render past the viewport edge, so the
   width is deliberately left to the grid and only overflow is constrained. */
body.dsh-main-sidebar-right div[class*="detailsCol"] {
  grid-column: 1 !important;
  grid-row: 1 !important;
  order: 1 !important;
  min-width: 0 !important;
  overflow: hidden !important;
}
body.dsh-main-sidebar-right div[class*="centerCol"] {
  grid-column: 2 !important;
  grid-row: 1 !important;
  order: 2 !important;
  min-width: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}
body.dsh-main-sidebar-right div[class*="sidebarCol"] {
  grid-column: 3 !important;
  grid-row: 1 !important;
  order: 3 !important;
  width: auto !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  border-right: none !important;
  border-left: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.12)) !important;
}
/* The secondary dock is position: fixed, so it is not in the shell grid at
   all and grid placement would be a no-op on it. Its viewport offsets are
   what actually move it to the left edge. */
body.dsh-main-sidebar-right .dsh-right-sidebar-dock {
  right: auto !important;
  left: 0 !important;
  border-left: none !important;
  border-right: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.12)) !important;
}
body.dsh-main-sidebar-right .dsh-mainview-terminal,
body.dsh-main-sidebar-right .dsh-mainview-container,
body.dsh-main-sidebar-right .dsh-mainview-monaco,
body.dsh-main-sidebar-right .dsh-top-conversation-header {
  left: var(--dsh-secondary-sidebar-width, 0px) !important;
  right: var(--dsh-main-sidebar-width, 240px) !important;
}
button[class*="sessionLogButton"],
[data-slot="conversation.session.header.utilities"] > button[class*="sessionLogButton"] {
  display: none !important;
}
[data-slot="conversation.session.header.utilities"] [class*="ellipsisButton"] {
  display: inline-flex !important;
}
[data-slot="conversation.session.header"],
[data-slot="conversation.header"],
[class*="SessionHeader"],
[class*="sessionHeader"],
header[class*="header"] {
  display: none !important;
}
[data-conversation-scroll],
div[class*="conversationScroll"],
div[class*="scrollPort"] {
  padding-top: 38px !important;
}
/* Composer Toolbar Layout: Split vs Unified.
   Anchors on the composer's own data attributes and real DOM order
   (harness packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:
   [data-composer-card] wraps [data-input-scroll] (the draft scrollport)
   immediately followed by the toolbar row, itself split into a leading
   tools group and a trailing model/send group), not hashed CSS-module
   class-name guesses. */
body.dsh-composer-split [data-composer-card] [data-input-scroll] + div {
  order: -1 !important;
  width: 100% !important;
  flex-wrap: wrap !important;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.12)) !important;
  margin-bottom: 6px !important;
  padding-bottom: 8px !important;
}
body.dsh-composer-split [data-composer-card] [data-input-scroll] + div > div:first-child {
  flex-basis: 100% !important;
}
/* Full-Width Conversation: ConversationRoot's own width axis reads
   --dsh-chat-user-width first, ahead of its adaptive clamp, and its width
   handles publish onto that same property when dragged (harness/packages/
   client/ui-conversation/src/client/skeleton/ConversationRoot.tsx). Setting
   it here reuses that existing override point instead of touching the
   pinned harness CSS module. Targeted at the ConversationRoot instance
   itself (the one element carrying both data-phase and a
   data-conversation-scroll descendant), not the whole document, so it
   cannot leak into an unrelated data-phase consumer elsewhere in the
   shell. A user's own per-conversation drag-resize (which writes this same
   property directly on the element, and re-asserts it, cleared or set, on
   every ResizeObserver tick) still wins over this class-level default.
   !important is not used: the drag handles must remain able to override
   it live while dragging. */
body.dsh-full-width-conversation [data-phase]:has([data-conversation-scroll]) {
  --dsh-chat-user-width: calc(100% - 48px);
}
@media (max-width: 768px) {
  .dsh-tw-root.dsh-tw-wide {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    max-width: 100vw !important;
    height: 100vh !important;
    z-index: 9999 !important;
    box-shadow: 0 0 40px rgba(0,0,0,0.8) !important;
  }
  .dsh-tw-panel {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    max-width: 100vw !important;
    max-height: 100vh !important;
    border-radius: 0 !important;
    transform: none !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-tw-wide,
  .dsh-tw-fading > *,
  .dsh-tw-railIn .dsh-tw-iconButton,
  .dsh-tw-railIn .dsh-tw-newSession,
  .dsh-tw-railIn .dsh-tw-footArea,
  .dsh-tw-railIn .dsh-tw-regionArea { transition: none; animation: none; }
}
`;

const SIDEBAR_ZH = {
  "session.new": "新会话",
  "session.new.label": "新建会话",
  "toggle.open": "打开侧边栏",
  "toggle.collapse": "收起侧边栏",
};

const SIDEBAR_EN = {
  "session.new": "New Session",
  "session.new.label": "New session",
  "toggle.open": "Open sidebar",
  "toggle.collapse": "Collapse sidebar",
};

const SETTINGS_ZH = {
  trigger: "设置",
  title: "设置",
  close: "关闭",
  openDocument: "打开配置文件",
  "openDocument.error": "无法打开配置文件",
  "general.nav": "通用设置",
};

const SETTINGS_EN = {
  trigger: "Settings",
  title: "Settings",
  close: "Close",
  openDocument: "Open configuration file",
  "openDocument.error": "Could not open configuration file",
  "general.nav": "General",
};

const COLLAPSE_SETTLE_MS = 150;
// crypto.randomUUID polyfill: see scripts/client-runtime/crypto-polyfill.js,
// prepended ahead of this file's content at build time.

window.__ModuleLoader__.load({
  id: "@dsh-stack/tweaks",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    //#region lib/client.js
    if (typeof document !== "undefined") {
      var style = document.querySelector('style[data-plugin-css="tweaks-shells"]');
      if (style === null) {
        style = document.createElement("style");
        style.setAttribute("data-plugin-css", "tweaks-shells");
        style.textContent = SHELL_CSS;
        document.head.appendChild(style);
      }
    }
    var React = require("react");
    var ReactDOM = typeof window !== "undefined" && window.ReactDOM ? window.ReactDOM : null;
    try {
      if (!ReactDOM) ReactDOM = require("react-dom");
    } catch (e) {}
    var P = require("@deepseek-ai/dsh-client-ui-primitives");
    if (typeof window !== "undefined") window.__dsh_P = P;
    var slotsModule = require("@deepseek-ai/dsh-client-ui-slots");
    var resolveSlotLabel = slotsModule.resolveSlotLabel;
    /**
     * Bind a bare {subscribe, getSnapshot} observable to a typed uSES
     * selector hook, over React's built-in useSyncExternalStore. Mirrors
     * dsh-client-ui-renderer's internal (unexported) bindSnapshotSelector.
     */
    function bindSnapshotSelector(w) {
      /** subscribe implementation. */
      var subscribe = function (fn) {
        return w.subscribe(fn);
      };
      return function useSelector(sel, eq) {
        var isEqual = eq || Object.is;
        var cacheRef = React.useRef(null);
        /** getSelection implementation. */
        var getSelection = function () {
          var next = sel(w.getSnapshot());
          if (cacheRef.current !== null && isEqual(cacheRef.current, next)) {
            return cacheRef.current;
          }
          cacheRef.current = next;
          return next;
        };
        return React.useSyncExternalStore(subscribe, getSelection);
      };
    }
    var h = React.createElement;
    var Fragment = React.Fragment;
    var createGlyphComponent = __dshCreateGlyphComponent(h);
    var createDecoratedGlyphComponent = __dshCreateDecoratedGlyphComponent(h);
    // The pill strip both multi-part settings surfaces render, and the fold
    // that turns the Customization group's flat siblings into one row with
    // sub-tabs. See client-settings-segmented-tabs.js and
    // client-settings-customization-hub.js (prepended to this bundle at build
    // time).
    var SegmentedTabs = __dshCreateSettingsSegmentedTabs(h);
    var customizationHub = __dshCreateSettingsCustomizationHub();

    /**
     * Creates a navigation icon component with a specified size and path elements.
     *
     * The function returns an array of SVG path elements that define the icon's appearance.
     *
     * @returns {Array} An array of SVG path elements composing the icon.
     */
    var KeychainNavIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }),
        h("path", { d: "m9 12 2 2 4-4" }),
      ];
    });

    /** ProvidersNavIcon implementation. */
    var ProvidersNavIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("line", { x1: "22", x2: "2", y1: "12", y2: "12" }),
        h("path", {
          d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
        }),
        h("line", { x1: "6", x2: "6.01", y1: "16", y2: "16" }),
        h("line", { x1: "10", x2: "10.01", y1: "16", y2: "16" }),
      ];
    });

    /**
     * Creates a navigation icon component.
     *
     * Returns an array of SVG elements representing the icon.
     *
     * On failure, it returns an empty array.
     */
    var GeneralNavIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("line", { x1: "21", x2: "14", y1: "4", y2: "4" }),
        h("line", { x1: "10", x2: "3", y1: "4", y2: "4" }),
        h("line", { x1: "21", x2: "12", y1: "12", y2: "12" }),
        h("line", { x1: "8", x2: "3", y1: "12", y2: "12" }),
        h("line", { x1: "21", x2: "16", y1: "20", y2: "20" }),
        h("line", { x1: "12", x2: "3", y1: "20", y2: "20" }),
        h("line", { x1: "14", x2: "14", y1: "2", y2: "6" }),
        h("line", { x1: "8", x2: "8", y1: "10", y2: "14" }),
        h("line", { x1: "16", x2: "16", y1: "18", y2: "22" }),
      ];
    });

    /**
     * Returns an array of SVG elements representing the plug navigation icon.
     *
     * @returns {Array} An array of SVG path elements composing the plug icon.
     */
    var PlugNavIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("rect", { width: "7", height: "7", x: "14", y: "3", rx: "1" }),
        h("path", {
          d: "M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3",
        }),
      ];
    });

    /**
     * Returns an array of SVG elements representing the plug navigation icon.
     *
     * @returns {Array} An array of SVG path and rect elements composing the plug icon.
     *                  The function returns an array of path and rect elements that form the navigation icon.
     *                  If the function fails to create the icon, it returns an empty array.
     */
    var ToolsNavIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("path", {
          d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
        }),
      ];
    });

    /**
     * Returns an array of SVG elements representing the plug navigation icon.
     *
     * @returns {Array} An array of SVG path and rect elements composing the plug icon.
     *                 The function returns a set of path and rect elements that form the
     *                 visual representation of the plug icon.
     */
    var LoopsNavIcon = createGlyphComponent(
      16,
      "dsh-icon-refresh",
      false,
      true,
      false,
      function () {
        return [
          h("path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }),
          h("path", { d: "M21 3v5h-5" }),
          h("path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }),
          h("path", { d: "M8 16H3v5" }),
        ];
      },
    );

    /**
     * Returns an array of SVG elements representing the plug navigation icon.
     *
     * @returns {Array} An array of SVG path elements composing the plug icon.
     *                  If the function fails to create the icon, it returns an empty array.
     */
    var TriangleRightFill14 = createGlyphComponent(14, "", true, true, false, function () {
      return [h("polyline", { points: "9 18 15 12 9 6" })];
    });

    /**
     * Returns an array of SVG elements representing the plug navigation icon.
     *
     * @returns {Array} An array of SVG path and rect elements composing the plug icon.
     *                  If successful, returns an array containing the icon elements; otherwise, returns an empty array.
     */
    var RobotHeadNavIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("path", { d: "M12 8V4H8" }),
        h("rect", { width: "16", height: "12", x: "4", y: "8", rx: "2" }),
        h("path", { d: "M2 14h2" }),
        h("path", { d: "M20 14h2" }),
        h("path", { d: "M15 13v2" }),
        h("path", { d: "M9 13v2" }),
      ];
    });

    /**
     * Returns an array of SVG elements representing navigation icons.
     *
     * @returns {Array} An array of SVG elements composing the navigation icon,
     *                 ensuring the visual representation is correctly formed.
     *                 If creation fails, returns an empty array.
     */
    var KeyboardNavIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("rect", { width: "20", height: "16", x: "2", y: "4", rx: "2" }),
        h("path", { d: "M6 8h.01" }),
        h("path", { d: "M10 8h.01" }),
        h("path", { d: "M14 8h.01" }),
        h("path", { d: "M18 8h.01" }),
        h("path", { d: "M8 12h.01" }),
        h("path", { d: "M12 12h.01" }),
        h("path", { d: "M16 12h.01" }),
        h("path", { d: "M7 16h10" }),
      ];
    });

    /** DataGlyph implementation. */
    var DataGlyph = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("polygon", { points: "12 2 2 7 12 12 22 7 12 2" }),
        h("polyline", { points: "2 17 12 22 22 17" }),
        h("polyline", { points: "2 12 12 17 22 12" }),
      ];
    });

    /**
     * Returns an array of SVG elements representing the plug navigation icon.
     *
     * @returns {Array} An array of SVG elements composing the plug icon, including paths and a polyline.
     *                  If successful, returns the icon elements; otherwise, returns an empty array.
     */
    var SettingsIcon = createGlyphComponent(
      16,
      "dsh-icon-settings",
      false,
      true,
      false,
      function () {
        return [
          h("path", {
            d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
          }),
          h("circle", { cx: "12", cy: "12", r: "3" }),
        ];
      },
    );

    /** SidebarCollapseIcon implementation. */
    var SidebarCollapseIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }),
        h("path", { d: "M9 3v18" }),
      ];
    });

    /**
     * Returns an array of SVG elements representing close icons.
     *
     * @returns {Array} An array of SVG elements composing the close icon,
     *                 ensuring the visual representation is correctly formed.
     *                 If creation fails, returns an empty array.
     */
    var CloseIcon = createGlyphComponent(14, "", false, true, false, function () {
      return [h("path", { d: "M18 6 6 18" }), h("path", { d: "m6 6 12 12" })];
    });

    /** CommandsIcon implementation. */
    var CommandsIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("path", { d: "m18 16 4-4-4-4" }),
        h("path", { d: "m6 8-4 4 4 4" }),
        h("path", { d: "m14.5 4-5 16" }),
      ];
    });

    /**
     * Returns an array of SVG components representing the icon.
     * If creation fails, returns an empty array.
     *
     * @returns {Array} An array of SVG components or an empty array on failure.
     */
    var PaletteIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor" }),
        h("circle", { cx: "17.5", cy: "10.5", r: ".5", fill: "currentColor" }),
        h("circle", { cx: "8.5", cy: "7.5", r: ".5", fill: "currentColor" }),
        h("circle", { cx: "6.5", cy: "12.5", r: ".5", fill: "currentColor" }),
        h("path", {
          d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z",
        }),
      ];
    });

    /** AgentPresetIcon implementation — same bot-head glyph as RobotHeadNavIcon. */
    var AgentPresetIcon = RobotHeadNavIcon;

    /**
     * Returns an array of SVG elements representing the ellipsis navigation icon.
     *
     * @returns {Array} An array of SVG elements composing the ellipsis icon, including paths and circles.
     *                  If successful, returns the icon elements; otherwise, returns an empty array.
     */
    var EllipsisIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("circle", { cx: "12", cy: "12", r: "1" }),
        h("circle", { cx: "19", cy: "12", r: "1" }),
        h("circle", { cx: "5", cy: "12", r: "1" }),
      ];
    });

    /**
     * Returns an array of SVG elements representing close icons.
     *
     * Guarantees:
     * - Returns an array containing SVG elements for the close icon.
     *
     * On failure path:
     * - Throws an error if the SVG generation function fails to return an array.
     */
    var DownloadIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        h("polyline", { points: "7 10 12 15 17 10" }),
        h("line", { x1: "12", x2: "12", y1: "15", y2: "3" }),
      ];
    });

    /**
     * Returns an array of SVG elements representing close icons.
     *
     * @returns {Array} An array of SVG elements composing the close icon, ensuring the visual representation is correctly formed.
     *                 If creation fails, returns an empty array.
     */
    var BranchIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("line", { x1: "6", x2: "6", y1: "3", y2: "15" }),
        h("circle", { cx: "18", cy: "6", r: "3" }),
        h("circle", { cx: "6", cy: "18", r: "3" }),
        h("path", { d: "M18 9a9 9 0 0 1-9 9" }),
      ];
    });

    /**
     * Applies the shell's own naming over a section's registered label, for
     * the handful of ids whose registrant name reads wrong in this nav (the
     * harness's "Agent presets" is this product's "Modes", and its "Actions"
     * are Commands). Applied once, to nav rows and Composition sub-tabs alike,
     * so the two surfaces can never disagree about a section's name.
     */
    function relabelSectionRow(row) {
      if (!row || !row.id) return row;
      if (row.id === "icons") return Object.assign({}, row, { label: "Icons" });
      if (row.id === "providers") return Object.assign({}, row, { label: "Providers" });
      if (row.id === "agent-presets") return Object.assign({}, row, { label: "Modes" });
      if (row.id === "actions" || row.id === "session-modes")
        return Object.assign({}, row, { label: "Commands" });
      if (row.id === "keybinds") return Object.assign({}, row, { label: "Keybinds" });
      return row;
    }

    /**
     * Returns the stacked-layers mark the consolidated Composition row wears:
     * the parts an assistant is composed of, seen edge-on.
     */
    var LayersNavIcon = createGlyphComponent(16, "", false, true, false, function () {
      return [
        h("path", {
          d: "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
        }),
        h("path", {
          d: "M2 12.18a1 1 0 0 0 .6.9l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 .58-.91",
        }),
        h("path", {
          d: "M2 17.18a1 1 0 0 0 .6.9l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 .58-.91",
        }),
      ];
    });

    /** navIcon implementation. */
    function navIcon(id) {
      if (id === "composition") return h(LayersNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "skills-hooks") return h(ToolsNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "general") return h(GeneralNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "integrations" || id === "providers")
        return h(ProvidersNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "accounts") return h(ProvidersNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "models") return h(DataGlyph, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "apps") return h(CommandsIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "provider-usage") return h(DataGlyph, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "keychain") return h(KeychainNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "session-modes" || id === "actions" || id === "commands")
        return h(CommandsIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "agents") return h(RobotHeadNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "appearance") return h(PaletteIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "agent-presets" || id === "modes")
        return h(AgentPresetIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "tools") return h(ToolsNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "loops") return h(LoopsNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "plugins") return h(PlugNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "keybinds" || id === "keybindings" || id === "shortcuts")
        return h(KeyboardNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      if (id === "hosts") return h(DataGlyph, { className: "dsh-tw-navIcon", size: 16 });
      return h(SettingsIcon, { className: "dsh-tw-navIcon", size: 16 });
    }

    // Glyph seat: a registrant's glyph wins; an id with no glyph falls back to
    // the static map so every nav cell keeps a mark. The fallback rides the
    // renderer's own `fallback` option -- a list slot filtered by `only` down
    // to zero rows still returns a (non-null) empty fragment, so testing the
    // return value for null/undefined never fired and glyph-less sections
    // rendered a blank cell instead of the shell mark.
    /**
     * Returns an array of SVG elements representing ellipsis icons.
     *
     * Guarantees:
     * - Returns an array containing SVG elements for the ellipsis icon.
     *
     * On failure path:
     * - Throws an error if the SVG generation function fails to return an array.
     */
    function navGlyph(renderSlot, row) {
      if (typeof renderSlot !== "function") return navIcon(row.id);
      try {
        return renderSlot("settings.section.icon", {}, { only: row.id, fallback: navIcon(row.id) });
      } catch (err) {
        return navIcon(row.id);
      }
    }

    /** NotepadPencilGlyph implementation. */
    var NotepadPencilGlyph = createDecoratedGlyphComponent(
      16,
      "dsh-icon-notepad",
      { display: "inline-flex", verticalAlign: "middle", flexShrink: 0 },
      false,
      function () {
        return [
          h("path", { d: "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" }),
          h("path", { d: "M2 6h4" }),
          h("path", { d: "M2 10h4" }),
          h("path", { d: "M2 14h4" }),
          h("path", { d: "M2 18h4" }),
          h("path", { d: "M18.4 2.6a2.12 2.12 0 0 1 3 3L11 16l-4 1 1-4Z" }),
        ];
      },
    );

    /**
     * Returns an SVG element representing the navigation icon based on the provided ID.
     *
     * @param {string} id - The ID specifying the type of navigation icon to return.
     * @returns {JSX.Element} The SVG element for the navigation icon, or an empty element if the ID is unrecognized.
     */
    var ChatGlyph = createDecoratedGlyphComponent(
      16,
      "",
      { display: "inline-flex", verticalAlign: "middle", flexShrink: 0 },
      false,
      function () {
        return [h("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" })];
      },
    );

    /**
     * Renders a terminal glyph for session-tree and workspace surfaces.
     *
     * @returns {React.ReactElement} An SVG element representing a terminal.
     */
    var TerminalsGlyph = createDecoratedGlyphComponent(
      16,
      "",
      { display: "inline-flex", verticalAlign: "middle", flexShrink: 0 },
      false,
      function () {
        return [
          h("polyline", { points: "4 17 10 11 4 5" }),
          h("line", { x1: "12", y1: "19", x2: "20", y2: "19" }),
        ];
      },
    );

    /**
     * Renders a container glyph for session-tree and workspace surfaces.
     *
     * @returns {React.ReactElement} An SVG element representing containers.
     */
    var ContainersGlyph = createDecoratedGlyphComponent(
      16,
      "",
      { display: "inline-flex", verticalAlign: "middle", flexShrink: 0 },
      false,
      function () {
        return [
          h("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2", ry: "2" }),
          h("line", { x1: "8", y1: "21", x2: "16", y2: "21" }),
          h("line", { x1: "12", y1: "17", x2: "12", y2: "21" }),
        ];
      },
    );

    var SettingsPanelErrorBoundary = (function (_super) {
      /**
       * Returns the appropriate navigation icon based on the provided `id`.
       *
       * Guarantees a navigation icon (`h(...)`) is returned for the given `id`,
       * falling back to `SettingsIcon` if no specific icon is matched.
       *
       * @param {string} id - The identifier for the navigation section.
       * @returns {React.ReactElement} The navigation icon corresponding to the `id`.
       */
      function SettingsPanelErrorBoundary(props) {
        if (_super && typeof _super === "function") {
          try {
            _super.call(this, props);
          } catch (e) {}
        }
        this.props = props;
        this.state = { hasError: false, error: null };
        return this;
      }
      if (_super && _super.prototype) {
        try {
          Object.setPrototypeOf(SettingsPanelErrorBoundary, _super);
          SettingsPanelErrorBoundary.prototype = Object.create(_super.prototype);
          SettingsPanelErrorBoundary.prototype.constructor = SettingsPanelErrorBoundary;
        } catch (e) {}
      } else {
        SettingsPanelErrorBoundary.prototype = {};
        SettingsPanelErrorBoundary.prototype.setState = function (partial) {
          if (typeof partial === "function") {
            this.state = Object.assign({}, this.state, partial(this.state));
          } else {
            this.state = Object.assign({}, this.state, partial);
          }
        };
      }
      SettingsPanelErrorBoundary.getDerivedStateFromError = function (error) {
        return { hasError: true, error: error };
      };
      SettingsPanelErrorBoundary.prototype.componentDidCatch = function (error, errorInfo) {
        console.error("SettingsPanel error caught by boundary:", error, errorInfo);
      };
      SettingsPanelErrorBoundary.prototype.render = function () {
        if (this.state && this.state.hasError) {
          var _this = this;
          return h(
            "div",
            {
              className: "dsh-tw-panel",
              style: {
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                color: "var(--dsw-alias-label-primary)",
              },
            },
            h(
              "h2",
              { style: { margin: 0, fontSize: "18px", fontWeight: 600 } },
              "Settings (Recovered)",
            ),
            h(
              "p",
              { style: { color: "var(--dsw-alias-state-error-primary)", margin: 0 } },
              "A non-fatal error occurred while rendering settings.",
            ),
            h(
              "pre",
              {
                style: {
                  fontSize: "12px",
                  background: "rgba(0,0,0,0.3)",
                  padding: "12px",
                  borderRadius: "8px",
                  overflow: "auto",
                },
              },
              String(
                this.state.error && this.state.error.message
                  ? this.state.error.message
                  : this.state.error,
              ),
            ),
            h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h(
                "button",
                {
                  type: "button",
                  style: {
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    background: "var(--dsw-alias-primary, #6366f1)",
                    color: "#fff",
                    cursor: "pointer",
                  },
                  onClick: function () {
                    _this.setState({ hasError: false, error: null });
                  },
                },
                "Retry",
              ),
              h(
                "button",
                {
                  type: "button",
                  style: {
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "1px solid var(--dsw-alias-border-l2)",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                  },
                  onClick: this.props && this.props.onClose,
                },
                "Close",
              ),
            ),
          );
        }
        return this.props && this.props.children;
      };
      return SettingsPanelErrorBoundary;
    })(React ? React.Component : undefined);

    /**
     * Renders a dropdown menu of selectable items anchored to the parent.
     *
     * Closes when the user clicks outside the menu. Calls `onSelect` with the
     * chosen item when an option is activated.
     *
     * @param {Object} props - Component props.
     * @returns {React.ReactElement | null} The dropdown menu, or null when closed.
     */
    function SelectDropdownMenu(props) {
      var open = props.open,
        onClose = props.onClose,
        items = props.items,
        onSelect = props.onSelect;
      var menuRef = React.useRef(null);

      React.useEffect(
        function () {
          if (!open) return;
          /**
           * Closes the dropdown when a pointerdown event occurs outside the menu.
           *
           * @param {Event} e - The pointerdown event.
           */
          var handlePointerDown = function (e) {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
              onClose();
            }
          };
          document.addEventListener("pointerdown", handlePointerDown);
          return function () {
            document.removeEventListener("pointerdown", handlePointerDown);
          };
        },
        [open, onClose],
      );

      if (!open) return null;

      var alignRight = Boolean(props && props.align === "right");
      return h(
        "div",
        {
          ref: menuRef,
          style: {
            position: "absolute",
            top: "100%",
            left: alignRight ? "auto" : "0",
            right: alignRight ? "0" : "auto",
            marginTop: "6px",
            zIndex: 99999,
            minWidth: "190px",
            background: "var(--dsw-alias-surface-l0, #1e1e2e)",
            border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
            borderRadius: "8px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            padding: "4px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          },
          onClick: function (e) {
            e.stopPropagation();
          },
        },
        items.map(function (item) {
          return h(
            "button",
            {
              key: item.id,
              type: "button",
              style: {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "none",
                background: "transparent",
                color: item.danger ? "#f85149" : "var(--dsw-alias-label-primary)",
                fontSize: "13px",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
              },
              onMouseEnter: function (e) {
                e.currentTarget.style.background =
                  "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.15))";
              },
              onMouseLeave: function (e) {
                e.currentTarget.style.background = "transparent";
              },
              onClick: function (e) {
                e.stopPropagation();
                onSelect(item.id);
                onClose();
              },
            },
            item.icon
              ? h("span", { style: { display: "inline-flex", flexShrink: 0 } }, item.icon)
              : null,
            h("span", { style: { flex: 1 } }, item.label),
          );
        }),
      );
    }

    /**
     * Displays an error message indicating a non-fatal error occurred while rendering settings.
     *
     * This component will render a panel with a title "Settings (Recovered)" and an error message
     * stating that a non-fatal error occurred.
     */
    function TriggerContent(props) {
      var wide = Boolean(props && props.wide);
      var t = props && props.t;
      var label = typeof t === "function" ? t("trigger") : "Settings";
      return h(
        Fragment,
        null,
        h(
          "svg",
          {
            width: wide ? 16 : 18,
            height: wide ? 16 : 18,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            className: "dsh-icon-animated dsh-icon-spinOnHover",
            style: { display: "inline-flex", verticalAlign: "middle", flexShrink: 0 },
          },
          h("path", {
            d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
          }),
          h("circle", { cx: "12", cy: "12", r: "3" }),
        ),
        wide
          ? h(
              "span",
              { className: "dsh-tw-triggerLabel", style: { marginLeft: "8px" } },
              label || "Settings",
            )
          : null,
      );
    }

    /**
     * Displays a header content with options to retry or close an action.
     *
     * @returns {JSX.Element} A JSX element representing the header content.
     */
    function HeaderContent(props) {
      var t = props.t;
      return h(Fragment, null, typeof t === "function" ? t("title") : "Settings");
    }

    /**
     * Displays a SettingsPanelErrorBoundary component with a "Close" button.
     * The "Close" button triggers the `onClose` prop function when clicked.
     *
     * @returns {JSX.Element} A SettingsPanelErrorBoundary component containing a button to close the label.
     */
    function CloseLabel(props) {
      var t = props.t;
      return h(Fragment, null, typeof t === "function" ? t("close") : "Close");
    }

    /**
     * Injects a custom theme palette as CSS custom properties into a `<style>` tag
     * (creating it on first use) and applies the corresponding `data-theme` attribute.
     * Shared by the theme studio's live preview and the module's saved-palette
     * initializer so both write the exact same variable set.
     */
    function applyCustomThemePaletteVars(palette, themeType) {
      if (typeof document === "undefined") return;
      var styleEl = document.getElementById("dsh-custom-theme-vars");
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "dsh-custom-theme-vars";
        document.head.appendChild(styleEl);
      }

      var css =
        ":root, [data-theme], body {\n" +
        "  --dsw-alias-primary: " +
        palette.primary +
        " !important;\n" +
        "  --dsw-alias-brand-primary: " +
        palette.primary +
        " !important;\n" +
        "  --dsw-alias-bg-base: " +
        palette.bgBase +
        " !important;\n" +
        "  --dsw-alias-bg-layer-1: " +
        palette.surfaceL1 +
        " !important;\n" +
        "  --dsw-alias-surface-l1: " +
        palette.surfaceL1 +
        " !important;\n" +
        "  --dsw-alias-bg-layer-2: " +
        palette.surfaceL2 +
        " !important;\n" +
        "  --dsw-alias-surface-l2: " +
        palette.surfaceL2 +
        " !important;\n" +
        "  --dsw-alias-bg-overlay: " +
        palette.surfaceL2 +
        " !important;\n" +
        "  --dsw-alias-border-l1: " +
        palette.borderL1 +
        " !important;\n" +
        "  --dsw-alias-border-l2: " +
        palette.borderL1 +
        " !important;\n" +
        "  --dsw-alias-label-primary: " +
        palette.textPrimary +
        " !important;\n" +
        "  --dsw-alias-label-secondary: " +
        palette.textSecondary +
        " !important;\n" +
        "  --dsw-specific-sidebar-fill: " +
        palette.sidebar +
        " !important;\n" +
        "}\n";

      styleEl.textContent = css;
      if (themeType === "oled") {
        document.documentElement.setAttribute("data-theme", "oled");
      } else if (themeType === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    }

    /** Style for the outer container of a single settings row (label + control). */
    var SETTINGS_ROW_CONTAINER_STYLE = {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "14px 16px",
      borderRadius: "10px",
      background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.04))",
      border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
    };

    /** Style for the bold title text inside a settings row label. */
    var SETTINGS_ROW_TITLE_STYLE = {
      fontSize: "14px",
      fontWeight: 600,
      color: "var(--dsw-alias-label-primary)",
    };

    /** Style for the secondary description text inside a settings row label. */
    var SETTINGS_ROW_DESC_STYLE = { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" };

    /** Style for a checkbox-style toggle control used as a settings row's control element. */
    var SETTINGS_ROW_CHECKBOX_STYLE = {
      width: "18px",
      height: "18px",
      cursor: "pointer",
      accentColor: "var(--dsw-alias-primary, #6366f1)",
    };

    /**
     * Renders one settings row: a title/description label on the left paired with an
     * arbitrary control element (select, checkbox, etc.) on the right. Shared by every
     * preferences row in GeneralSection to avoid repeating the row/label style objects.
     */
    function createSettingsRow(title, description, control) {
      return h(
        "div",
        { style: SETTINGS_ROW_CONTAINER_STYLE },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "3px" } },
          h("div", { style: SETTINGS_ROW_TITLE_STYLE }, title),
          h("div", { style: SETTINGS_ROW_DESC_STYLE }, description),
        ),
        control,
      );
    }

    /** Renders a checkbox toggle control for use as a settings row's control element. */
    function createSettingsToggleCheckbox(checked, onChange) {
      return h("input", {
        type: "checkbox",
        checked: checked,
        onChange: onChange,
        style: SETTINGS_ROW_CHECKBOX_STYLE,
      });
    }

    /** Style for a <select> control used as a settings row's control element. */
    var SETTINGS_ROW_SELECT_STYLE = {
      padding: "6px 12px",
      borderRadius: "8px",
      border: "1px solid var(--dsw-alias-border-l1)",
      background: "var(--dsw-alias-bg-layer-2)",
      color: "var(--dsw-alias-label-primary)",
      fontSize: "13px",
      cursor: "pointer",
    };

    /** Writes a setting value to localStorage, silently ignoring quota/availability errors. */
    function persistSettingToLocalStorage(storageKey, value) {
      try {
        localStorage.setItem(storageKey, value);
      } catch (err) {}
    }

    /**
     * Whether the Settings -> General "Internal Testing Notice" toggle is on
     * (i.e. the notice is allowed to show). Shared by the toggle's own
     * checkbox state and by TweaksWelcomeNoticeOverride, the settings.onboarding
     * override that actually gates the modal, so the two never disagree about
     * the default (unset key) reading.
     */
    function isWelcomeNoticeEnabled() {
      if (typeof window === "undefined" || !window.localStorage) return false;
      return window.localStorage.getItem("dsh_suppress_welcome_notice") === "false";
    }

    /**
     * Renders a <select> control for use as a settings row's control element, from an array
     * of {value, label} option entries.
     */
    function createSettingsSelect(value, onChange, optionEntries) {
      return h(
        "select",
        { value: value, onChange: onChange, style: SETTINGS_ROW_SELECT_STYLE },
        optionEntries.map(function (opt) {
          return h("option", { key: opt.value, value: opt.value }, opt.label);
        }),
      );
    }

    /** Registered agent preset ids the Default Agent Preset dropdown may offer. */
    var AGENT_PRESET_OPTIONS = [
      { value: "standard", label: "Standard (Full Harness)" },
      { value: "ptc", label: "PTC (Programmer Tool Call)" },
      { value: "minimal", label: "Minimal (Bash + Editor)" },
      { value: "cordis", label: "Creator (Preset Authoring)" },
    ];

    /** Read the stored default preset, migrating any no-longer-registered id to standard. */
    function readDefaultPreset() {
      var fallback = "standard";
      if (typeof window === "undefined" || !window.localStorage) return fallback;
      try {
        var stored = window.localStorage.getItem("dsh_default_preset");
        if (!stored) return fallback;
        var valid = AGENT_PRESET_OPTIONS.some(function (opt) {
          return opt.value === stored;
        });
        if (!valid) {
          window.localStorage.setItem("dsh_default_preset", fallback);
          return fallback;
        }
        return stored;
      } catch (e) {
        return fallback;
      }
    }

    /** GeneralSection implementation. */
    function GeneralSection(props) {
      var noticeState = React.useState(isWelcomeNoticeEnabled);
      var noticeEnabled = noticeState[0],
        setNoticeEnabled = noticeState[1];

      var searchState = React.useState(function () {
        if (typeof window === "undefined" || !window.localStorage) return true;
        return window.localStorage.getItem("dsh_show_sidebar_search") !== "false";
      });
      var searchEnabled = searchState[0],
        setSearchEnabled = searchState[1];

      var mainSidebarLocationState = React.useState(function () {
        if (typeof window === "undefined" || !window.localStorage) return "left";
        var saved = window.localStorage.getItem("dsh_main_sidebar_location");
        if (saved === "left" || saved === "right") return saved;
        var legacy = window.localStorage.getItem("dsh_swap_sidebars");
        return legacy === "true" ? "right" : "left";
      });
      var mainSidebarLocation = mainSidebarLocationState[0],
        setMainSidebarLocation = mainSidebarLocationState[1];

      var defaultModeState = React.useState(readDefaultPreset);
      var defaultMode = defaultModeState[0],
        setDefaultMode = defaultModeState[1];

      var permissionState = React.useState(function () {
        try {
          return localStorage.getItem("dsh_permission_preset") || "danger-full-access";
        } catch (e) {
          return "danger-full-access";
        }
      });
      var permissionPreset = permissionState[0],
        setPermissionPreset = permissionState[1];

      var enterBehaviorState = React.useState(function () {
        try {
          return localStorage.getItem("dsh_send_on_enter") !== "false";
        } catch (e) {
          return true;
        }
      });
      var sendOnEnter = enterBehaviorState[0],
        setSendOnEnter = enterBehaviorState[1];

      var showThinkingState = React.useState(function () {
        try {
          return localStorage.getItem("dsh_show_reasoning_trace") !== "false";
        } catch (e) {
          return true;
        }
      });
      var showThinking = showThinkingState[0],
        setShowThinking = showThinkingState[1];

      var autoScrollState = React.useState(function () {
        try {
          return localStorage.getItem("dsh_auto_scroll_stream") !== "false";
        } catch (e) {
          return true;
        }
      });
      var autoScroll = autoScrollState[0],
        setAutoScroll = autoScrollState[1];

      /**
       * Sets various CSS variables for the palette to update the UI's appearance.
       *
       * This function updates the background and surface colors for different layers
       * and borders, ensuring the UI reflects the provided palette settings.
       *
       * @param {Object} palette - An object containing color values for the UI.
       */
      var handleToggleNotice = function (e) {
        var checked = e.target.checked;
        setNoticeEnabled(checked);
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("dsh_suppress_welcome_notice", checked ? "false" : "true");
        }
      };

      /**
       * Sets the theme style based on the provided theme type.
       *
       * Guarantees the document's root element's data-theme attribute is set to the given theme type.
       * On failure, the style element's text content is updated with the new CSS, but no attribute is set.
       */
      var handleToggleSearch = function (e) {
        var checked = e.target.checked;
        setSearchEnabled(checked);
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("dsh_show_sidebar_search", checked ? "true" : "false");
          window.dispatchEvent(
            new CustomEvent("dsh:sidebar-search-toggle", { detail: { enabled: checked } }),
          );
        }
      };

      /**
       * Sets the main sidebar location (left or right), updating the body class and
       * notifying other surfaces via a custom event.
       */
      var handleSelectMainSidebarLocation = function (e) {
        var location = e.target.value;
        setMainSidebarLocation(location);
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("dsh_main_sidebar_location", location);
          try {
            window.localStorage.removeItem("dsh_swap_sidebars");
          } catch (err) {}
          window.dispatchEvent(
            new CustomEvent("dsh:main-sidebar-location", { detail: { location: location } }),
          );
          if (document.body) {
            if (location === "right") document.body.classList.add("dsh-main-sidebar-right");
            else document.body.classList.remove("dsh-main-sidebar-right");
          }
        }
      };

      var fullWidthConversationState = React.useState(function () {
        if (typeof window === "undefined" || !window.localStorage) return false;
        return window.localStorage.getItem("dsh_full_width_conversation") === "true";
      });
      var fullWidthConversation = fullWidthConversationState[0],
        setFullWidthConversation = fullWidthConversationState[1];

      /**
       * Toggles the full-width conversation setting, overriding the transcript
       * and composer's adaptive width clamp with a near-full-column width via
       * the --dsh-chat-user-width override point the harness width handles
       * already publish to (see the SHELL_CSS rule above).
       */
      var handleToggleFullWidthConversation = function (e) {
        var checked = e.target.checked;
        setFullWidthConversation(checked);
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("dsh_full_width_conversation", checked ? "true" : "false");
          if (document.body) {
            if (checked) document.body.classList.add("dsh-full-width-conversation");
            else document.body.classList.remove("dsh-full-width-conversation");
          }
        }
      };

      var hideSendState = React.useState(function () {
        if (typeof window === "undefined" || !window.localStorage) return false;
        return window.localStorage.getItem("dsh_hide_send_button") === "true";
      });
      var hideSendButton = hideSendState[0],
        setHideSendButton = hideSendState[1];

      /**
       * Toggles the visibility of the send action in the settings interface.
       *
       * Guarantees that the send action visibility is flipped to the opposite state.
       *
       * @returns {void} No return value, but changes the visibility of the send action.
       */
      var handleToggleHideSend = function (e) {
        var checked = e.target.checked;
        setHideSendButton(checked);
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("dsh_hide_send_button", checked ? "true" : "false");
          if (document.body) {
            if (checked) document.body.classList.add("dsh-hide-inactive-send");
            else document.body.classList.remove("dsh-hide-inactive-send");
          }
        }
      };

      var composerLayoutState = React.useState(function () {
        if (typeof window === "undefined" || !window.localStorage) return "unified";
        return window.localStorage.getItem("dsh_composer_toolbar_layout") || "unified";
      });
      var composerLayout = composerLayoutState[0],
        setComposerLayout = composerLayoutState[1];

      /**
       * Renders a settings row with a title, description, and a toggle checkbox control.
       * @param {string} title - The title of the settings row.
       * @param {string} description - The description of the settings row.
       * @param {boolean} checked - The initial checked state of the toggle checkbox.
       * @param {function} onChange - The callback for when the checkbox state changes.
       * @returns {JSX.Element} A JSX element representing the settings row.
       */
      var handleSelectComposerLayout = function (e) {
        var val = e.target.value;
        setComposerLayout(val);
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("dsh_composer_toolbar_layout", val);
          window.dispatchEvent(
            new CustomEvent("dsh:composer-layout-changed", { detail: { layout: val } }),
          );
          if (document.body) {
            if (val === "split") {
              document.body.classList.add("dsh-composer-split");
              document.body.classList.remove("dsh-composer-unified");
            } else {
              document.body.classList.add("dsh-composer-unified");
              document.body.classList.remove("dsh-composer-split");
            }
          }
        }
      };

      return h(
        "div",
        {
          className: "dsh-tw-section",
          style: { display: "flex", flexDirection: "column", gap: "14px", maxWidth: "780px" },
        },
        h(
          "div",
          null,
          h(
            "h2",
            {
              style: {
                margin: "0 0 4px",
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--dsw-alias-label-primary)",
              },
            },
            "General Preferences",
          ),
          h(
            "p",
            { style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
            "Configure default presets, execution permissions, chat composer behavior, and window layout.",
          ),
        ),
        // 0. Composer Toolbar Layout Setting
        createSettingsRow(
          "Composer Toolbar Layout",
          "Choose between a unified single input line or a split top toolbar",
          createSettingsSelect(composerLayout, handleSelectComposerLayout, [
            { value: "unified", label: "Unified Input Bar (Inline)" },
            { value: "split", label: "Split Toolbar (Dedicated Bar)" },
          ]),
        ),
        // 1. Default Preset Picker
        createSettingsRow(
          "Default Agent Preset",
          "Preset applied when creating new conversation sessions",
          createSettingsSelect(
            defaultMode,
            function (e) {
              setDefaultMode(e.target.value);
              persistSettingToLocalStorage("dsh_default_preset", e.target.value);
            },
            AGENT_PRESET_OPTIONS,
          ),
        ),
        // 2. Permission Preset
        createSettingsRow(
          "Execution Permission Level",
          "Control tool invocation and shell command execution permissions",
          createSettingsSelect(
            permissionPreset,
            function (e) {
              setPermissionPreset(e.target.value);
              persistSettingToLocalStorage("dsh_permission_preset", e.target.value);
            },
            [
              { value: "danger-full-access", label: "Full Access (Autonomous Execution)" },
              { value: "confirm-destructive", label: "Confirm Destructive Actions" },
              { value: "read-only", label: "Read-Only (Ask for edits)" },
            ],
          ),
        ),
        // 3. Enter Key Behavior
        createSettingsRow(
          "Send Message on Enter",
          "When disabled, Cmd+Enter sends and Enter adds a new line",
          createSettingsToggleCheckbox(sendOnEnter, function (e) {
            setSendOnEnter(e.target.checked);
            persistSettingToLocalStorage("dsh_send_on_enter", e.target.checked ? "true" : "false");
          }),
        ),
        // 4. Stream Reasoning Trace
        createSettingsRow(
          "Show Thinking & Reasoning Trace",
          "Display collapsible model internal thinking trace during agent responses",
          createSettingsToggleCheckbox(showThinking, function (e) {
            setShowThinking(e.target.checked);
            persistSettingToLocalStorage(
              "dsh_show_reasoning_trace",
              e.target.checked ? "true" : "false",
            );
          }),
        ),
        // 5. Auto Scroll
        createSettingsRow(
          "Auto-Scroll During Stream",
          "Automatically follow new message tokens to bottom of chat",
          createSettingsToggleCheckbox(autoScroll, function (e) {
            setAutoScroll(e.target.checked);
            persistSettingToLocalStorage(
              "dsh_auto_scroll_stream",
              e.target.checked ? "true" : "false",
            );
          }),
        ),
        // 6. Hide Inactive Send Button Setting
        createSettingsRow(
          "Hide Send Button When Inactive",
          "Hide the submit button when the message input is empty or disabled",
          createSettingsToggleCheckbox(hideSendButton, handleToggleHideSend),
        ),
        // 7. Sidebar Search
        createSettingsRow(
          "Sidebar Search Bar",
          "Display quick search bar at the top of the sidebar explorer",
          createSettingsToggleCheckbox(searchEnabled, handleToggleSearch),
        ),
        // 8. Main Sidebar Location
        createSettingsRow(
          "Main Sidebar Location",
          "Choose which side the main sidebar appears on",
          createSettingsSelect(mainSidebarLocation, handleSelectMainSidebarLocation, [
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
          ]),
        ),
        // 9. Internal Testing Notice
        createSettingsRow(
          "Internal Testing Notice",
          "Show the internal testing notice modal dialog on startup",
          createSettingsToggleCheckbox(noticeEnabled, handleToggleNotice),
        ),
        // 10. Full-Width Conversation
        createSettingsRow(
          "Full-Width Conversation",
          "Expand the transcript and composer to fill the conversation column instead of the adaptive centered width",
          createSettingsToggleCheckbox(fullWidthConversation, handleToggleFullWidthConversation),
        ),
      );
    }

    /**
     * Stack-owned override for the harness "welcome-notice" settings.onboarding
     * entry (client-ui-settings-models' WelcomeNotice, registered at the
     * default priority 0). Registering under the same id at priority -10 wins
     * the slot's per-id shadowing cell (the same override mechanism this file
     * already uses for every settings.section entry), so this component is
     * the one that actually mounts; the harness modal underneath never
     * renders.
     *
     * Gated on the same "dsh_suppress_welcome_notice" key the "Internal
     * Testing Notice" toggle writes: when the toggle is off, the step
     * completes itself immediately (transparent pass-through to the next
     * onboarding step) instead of showing anything. When the toggle is on,
     * acknowledgement is persisted to "dsh_welcome_notice_acknowledged" in
     * localStorage rather than through the harness WelcomeNoticeStore, whose
     * acknowledgement is durable only for a loopback browser and memory-only
     * (lost on reload/navigation) for a remote one.
     */
    function TweaksWelcomeNoticeOverride(props) {
      var complete = props && props.complete;
      var finishedRef = React.useRef(false);
      var finish = React.useCallback(
        function () {
          if (finishedRef.current) return;
          finishedRef.current = true;
          if (typeof complete === "function") complete();
        },
        [complete],
      );

      var enabled = isWelcomeNoticeEnabled();
      var acknowledged =
        typeof window !== "undefined" && window.localStorage
          ? window.localStorage.getItem("dsh_welcome_notice_acknowledged") === "true"
          : false;
      var shouldShow = enabled && !acknowledged;

      React.useEffect(
        function () {
          if (!shouldShow) finish();
        },
        [shouldShow, finish],
      );

      if (!shouldShow) return null;

      /**
       * Persists the user's acknowledgement of the welcome notice and completes
       * the onboarding step so the coordinator advances to the next entry.
       */
      var acknowledge = function () {
        persistSettingToLocalStorage("dsh_welcome_notice_acknowledged", "true");
        finish();
      };

      return h(
        "div",
        { className: "dsh-tw-overlay", role: "presentation" },
        h("div", { className: "dsh-tw-mask", "aria-hidden": "true" }),
        h(
          "div",
          {
            className: "dsh-tw-welcomeNotice",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "Internal Testing Notice",
          },
          h("h2", { className: "dsh-tw-welcomeNoticeTitle" }, "Internal Testing Notice"),
          h(
            "p",
            { className: "dsh-tw-welcomeNoticeBody" },
            "DeepSeek Stack remains in active testing. Plugins and APIs continue to evolve, and feedback from the developer community is welcome.",
          ),
          h(
            "div",
            { className: "dsh-tw-welcomeNoticeActions" },
            h(
              "button",
              { type: "button", className: "dsh-tw-welcomeNoticeButton", onClick: acknowledge },
              "Continue",
            ),
          ),
        ),
      );
    }

    /**
     * The Appearance section's own tab: the palette studio that edits the
     * live CSS custom properties, saves named palettes and exports them.
     *
     * It registers into `settings.appearance.tab` alongside the tabs owned by
     * `themes`, `providers` and `skin-settings`, so the section that hosts it
     * treats it like any other contribution rather than special-casing the
     * package it happens to live in.
     */
    function ThemeStudioTab() {
      var THEME_PRESETS = [
        {
          id: "dark",
          name: "Dark (Default)",
          type: "dark",
          colors: {
            primary: "#6366f1",
            bgBase: "#0f1117",
            surfaceL1: "#161922",
            surfaceL2: "#202430",
            borderL1: "#262935",
            textPrimary: "#ffffff",
            textSecondary: "#9ca3af",
            sidebar: "#0b0d13",
          },
        },
        {
          id: "oled",
          name: "OLED True Black",
          type: "oled",
          colors: {
            primary: "#6366f1",
            bgBase: "#000000",
            surfaceL1: "#080808",
            surfaceL2: "#121212",
            borderL1: "#1f1f1f",
            textPrimary: "#ffffff",
            textSecondary: "#888888",
            sidebar: "#000000",
          },
        },
        {
          id: "andromeda",
          name: "Andromeda Blurple",
          type: "dark",
          colors: {
            primary: "#818cf8",
            bgBase: "#0c0e17",
            surfaceL1: "#131726",
            surfaceL2: "#1c2237",
            borderL1: "#28314e",
            textPrimary: "#f1f5f9",
            textSecondary: "#94a3b8",
            sidebar: "#090b12",
          },
        },
        {
          id: "cyberpunk",
          name: "Cyberpunk Neon",
          type: "dark",
          colors: {
            primary: "#00f0ff",
            bgBase: "#08090f",
            surfaceL1: "#10121d",
            surfaceL2: "#1a1d2e",
            borderL1: "#ff007f",
            textPrimary: "#00f0ff",
            textSecondary: "#ff007f",
            sidebar: "#05060a",
          },
        },
        {
          id: "monokai",
          name: "Monokai Pro",
          type: "dark",
          colors: {
            primary: "#ffd866",
            bgBase: "#19181a",
            surfaceL1: "#221f22",
            surfaceL2: "#2d2a2e",
            borderL1: "#3a363b",
            textPrimary: "#fcfcfa",
            textSecondary: "#939293",
            sidebar: "#141315",
          },
        },
        {
          id: "forest",
          name: "Forest Pine",
          type: "dark",
          colors: {
            primary: "#10b981",
            bgBase: "#0b120e",
            surfaceL1: "#111b15",
            surfaceL2: "#192820",
            borderL1: "#22382c",
            textPrimary: "#ecfdf5",
            textSecondary: "#6ee7b7",
            sidebar: "#080d0a",
          },
        },
        {
          id: "light",
          name: "Light Slate",
          type: "light",
          colors: {
            primary: "#4f46e5",
            bgBase: "#f8fafc",
            surfaceL1: "#f1f5f9",
            surfaceL2: "#e2e8f0",
            borderL1: "#cbd5e1",
            textPrimary: "#0f172a",
            textSecondary: "#475569",
            sidebar: "#f1f5f9",
          },
        },
      ];

      var activeThemeState = React.useState(function () {
        if (typeof window !== "undefined" && window.localStorage) {
          return window.localStorage.getItem("dsh_active_theme") || "dark";
        }
        return "dark";
      });
      var activeTheme = activeThemeState[0],
        setActiveTheme = activeThemeState[1];

      var customPaletteState = React.useState(function () {
        if (typeof window !== "undefined" && window.localStorage) {
          var saved = window.localStorage.getItem("dsh_custom_palette");
          if (saved) {
            try {
              return JSON.parse(saved);
            } catch (e) {}
          }
        }
        return Object.assign({}, THEME_PRESETS[0].colors);
      });
      var customPalette = customPaletteState[0],
        setCustomPalette = customPaletteState[1];

      var customThemesState = React.useState(function () {
        if (typeof window !== "undefined" && window.localStorage) {
          var saved = window.localStorage.getItem("dsh_custom_themes_list");
          if (saved) {
            try {
              return JSON.parse(saved);
            } catch (e) {}
          }
        }
        return [];
      });
      var customThemes = customThemesState[0],
        setCustomThemes = customThemesState[1];

      var newThemeNameState = React.useState("");
      var newThemeName = newThemeNameState[0],
        setNewThemeName = newThemeNameState[1];

      /**
       * Sets the composer toolbar layout and the default agent preset for the page.
       *
       * Guarantees the composer toolbar layout and default preset are updated according to user selection.
       * Fails if the layout or preset selection is invalid or not persistable.
       */
      var applyPaletteToPage = applyCustomThemePaletteVars;

      var /** selectPreset implementation. */
        selectPreset = function (preset) {
          setActiveTheme(preset.id);
          setCustomPalette(Object.assign({}, preset.colors));
          applyPaletteToPage(preset.colors, preset.type);
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem("dsh_active_theme", preset.id);
            window.localStorage.setItem("dsh_custom_palette", JSON.stringify(preset.colors));
          }
        };

      var /** updateColor implementation. */
        updateColor = function (key, value) {
          var updated = Object.assign({}, customPalette);
          updated[key] = value;
          setCustomPalette(updated);
          setActiveTheme("custom");
          applyPaletteToPage(updated, "custom");
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem("dsh_active_theme", "custom");
            window.localStorage.setItem("dsh_custom_palette", JSON.stringify(updated));
          }
        };

      /**
       * Sets the execution permission level based on the selected preset.
       * Updates the UI and persists the selected preset to local storage.
       * If an invalid preset is selected, no changes are made.
       */
      var handleSaveCustomTheme = function () {
        var name = (newThemeName || "").trim();
        if (!name) {
          name = "Custom Theme " + (customThemes.length + 1);
        }
        var newTheme = {
          id: "custom-" + Date.now(),
          name: name,
          type: "custom",
          colors: Object.assign({}, customPalette),
        };
        var nextList = customThemes.concat([newTheme]);
        setCustomThemes(nextList);
        setNewThemeName("");
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("dsh_custom_themes_list", JSON.stringify(nextList));
        }
      };

      /**
       * Handles the deletion of a custom theme setting.
       *
       * Guarantees that the theme setting is removed from the settings state and
       * persists the change to local storage.
       *
       * Fails if the theme setting is not found in the settings state.
       */
      var handleDeleteCustomTheme = function (themeId, e) {
        if (e) e.stopPropagation();
        var nextList = customThemes.filter(function (t) {
          return t.id !== themeId;
        });
        setCustomThemes(nextList);
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("dsh_custom_themes_list", JSON.stringify(nextList));
        }
      };

      /**
       * Toggles the export themes setting, persisting the preference to local storage.
       *
       * - Ensures the `showThinking` or `autoScroll` state is updated based on the checkbox value.
       * - Stores the setting in local storage as "dsh_export_themes" with "true" or "false" value.
       *
       * Fails if the setting value is not correctly updated or persisted.
       */
      var handleExportThemes = function () {
        var data = {
          activeTheme: activeTheme,
          customPalette: customPalette,
          customThemes: customThemes,
        };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "themes.json";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        }, 1000);
      };

      var COLOR_FIELDS = [
        { key: "primary", label: "Primary Accent (Blurple)" },
        { key: "bgBase", label: "Base Background" },
        { key: "surfaceL1", label: "Surface Layer 1" },
        { key: "surfaceL2", label: "Surface Layer 2" },
        { key: "borderL1", label: "Border Color" },
        { key: "textPrimary", label: "Primary Text Color" },
        { key: "textSecondary", label: "Secondary Text Color" },
        { key: "sidebar", label: "Sidebar Fill" },
      ];

      return h(
        "div",
        {
          className: "dsh-tw-section",
          style: { display: "flex", flexDirection: "column", gap: "20px", padding: "4px 0" },
        },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          h(
            "h3",
            {
              style: {
                margin: 0,
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--dsw-alias-label-primary)",
              },
            },
            "Theme & Appearance Studio",
          ),
          h(
            "p",
            { style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
            "Customize system colors, switch preset themes, or create and export custom themes.",
          ),
        ),

        // Presets Grid
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "10px" } },
          h(
            "label",
            {
              style: {
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "var(--dsw-alias-label-secondary)",
              },
            },
            "Theme Presets",
          ),
          h(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "10px",
              },
            },
            THEME_PRESETS.map(function (preset) {
              var isSelected = activeTheme === preset.id;
              return h(
                "div",
                {
                  key: preset.id,
                  onClick: function () {
                    selectPreset(preset);
                  },
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    padding: "12px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    border: isSelected
                      ? "2px solid var(--dsw-alias-primary, #6366f1)"
                      : "1px solid var(--dsw-alias-border-l1)",
                    background: isSelected
                      ? "rgba(99, 102, 241, 0.1)"
                      : "var(--dsw-alias-surface-l1, rgba(255,255,255,0.04))",
                    transition: "all 150ms ease",
                  },
                },
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    },
                  },
                  h(
                    "span",
                    {
                      style: {
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--dsw-alias-label-primary)",
                      },
                    },
                    preset.name,
                  ),
                  isSelected
                    ? h(
                        "span",
                        {
                          style: {
                            fontSize: "11px",
                            color: "var(--dsw-alias-primary, #6366f1)",
                            fontWeight: 700,
                          },
                        },
                        "✓ Active",
                      )
                    : null,
                ),
                h(
                  "div",
                  { style: { display: "flex", gap: "4px" } },
                  h("div", {
                    style: {
                      width: "16px",
                      height: "16px",
                      borderRadius: "4px",
                      background: preset.colors.primary,
                    },
                  }),
                  h("div", {
                    style: {
                      width: "16px",
                      height: "16px",
                      borderRadius: "4px",
                      background: preset.colors.bgBase,
                      border: "1px solid rgba(128,128,128,0.3)",
                    },
                  }),
                  h("div", {
                    style: {
                      width: "16px",
                      height: "16px",
                      borderRadius: "4px",
                      background: preset.colors.surfaceL1,
                    },
                  }),
                  h("div", {
                    style: {
                      width: "16px",
                      height: "16px",
                      borderRadius: "4px",
                      background: preset.colors.borderL1,
                    },
                  }),
                ),
              );
            }),
          ),
        ),

        // Color Customizer Section
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "12px", marginTop: "10px" } },
          h(
            "label",
            {
              style: {
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "var(--dsw-alias-label-secondary)",
              },
            },
            "Live Color Customizer",
          ),
          h(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: "12px",
              },
            },
            COLOR_FIELDS.map(function (field) {
              var val = customPalette[field.key] || "#6366f1";
              return h(
                "div",
                {
                  key: field.key,
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: "var(--dsw-alias-surface-l1, rgba(255,255,255,0.03))",
                    border: "1px solid var(--dsw-alias-border-l1)",
                  },
                },
                h(
                  "span",
                  { style: { fontSize: "12.5px", color: "var(--dsw-alias-label-primary)" } },
                  field.label,
                ),
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  h("input", {
                    type: "color",
                    value:
                      val.startsWith("#") && (val.length === 7 || val.length === 4)
                        ? val
                        : "#6366f1",
                    onChange: function (e) {
                      updateColor(field.key, e.target.value);
                    },
                    style: {
                      width: "28px",
                      height: "28px",
                      padding: 0,
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      background: "transparent",
                    },
                  }),
                  h("input", {
                    type: "text",
                    value: val,
                    onChange: function (e) {
                      updateColor(field.key, e.target.value);
                    },
                    style: {
                      width: "76px",
                      padding: "4px 6px",
                      fontSize: "12px",
                      fontFamily: "monospace",
                      borderRadius: "5px",
                      border: "1px solid var(--dsw-alias-border-l1)",
                      background: "var(--dsw-alias-surface-l2, rgba(0,0,0,0.2))",
                      color: "var(--dsw-alias-label-primary)",
                    },
                  }),
                ),
              );
            }),
          ),
        ),

        // Live Preview Box
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid var(--dsw-alias-border-l1)",
              background: customPalette.surfaceL1,
              color: customPalette.textPrimary,
            },
          },
          h(
            "div",
            {
              style: {
                fontSize: "12px",
                fontWeight: 700,
                color: customPalette.textSecondary,
                textTransform: "uppercase",
              },
            },
            "Theme Preview Sample",
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" } },
            h(
              "button",
              {
                type: "button",
                style: {
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: customPalette.primary,
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                },
              },
              "Primary Action",
            ),
            h(
              "span",
              { style: { fontSize: "13px", color: customPalette.textPrimary } },
              "Main text rendered cleanly.",
            ),
            h(
              "span",
              { style: { fontSize: "12px", color: customPalette.textSecondary } },
              "Secondary muted info.",
            ),
          ),
        ),

        // Save Custom Theme Section
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" } },
          h(
            "label",
            {
              style: {
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "var(--dsw-alias-label-secondary)",
              },
            },
            "Save & Export Custom Themes",
          ),
          h(
            "div",
            { style: { display: "flex", gap: "8px", alignItems: "center" } },
            h("input", {
              type: "text",
              placeholder: "New theme name…",
              value: newThemeName,
              onChange: function (e) {
                setNewThemeName(e.target.value);
              },
              style: {
                flex: 1,
                padding: "8px 12px",
                fontSize: "13px",
                borderRadius: "8px",
                border: "1px solid var(--dsw-alias-border-l1)",
                background: "var(--dsw-alias-surface-l1)",
                color: "var(--dsw-alias-label-primary)",
              },
            }),
            h(
              "button",
              {
                type: "button",
                onClick: handleSaveCustomTheme,
                style: {
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "var(--dsw-alias-primary, #6366f1)",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                },
              },
              "+ Save Custom Theme",
            ),
            h(
              "button",
              {
                type: "button",
                onClick: handleExportThemes,
                style: {
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--dsw-alias-border-l1)",
                  background: "transparent",
                  color: "var(--dsw-alias-label-primary)",
                  fontSize: "13px",
                  cursor: "pointer",
                },
              },
              "Export JSON",
            ),
          ),
          customThemes.length > 0
            ? h(
                "div",
                {
                  style: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" },
                },
                customThemes.map(function (ct) {
                  return h(
                    "div",
                    {
                      key: ct.id,
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        background: "var(--dsw-alias-surface-l1)",
                        border: "1px solid var(--dsw-alias-border-l1)",
                      },
                    },
                    h(
                      "span",
                      {
                        style: {
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "var(--dsw-alias-label-primary)",
                        },
                      },
                      ct.name,
                    ),
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "8px" } },
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: function () {
                            setActiveTheme(ct.id);
                            setCustomPalette(ct.colors);
                            applyPaletteToPage(ct.colors, "custom");
                          },
                          style: {
                            padding: "4px 10px",
                            borderRadius: "5px",
                            border: "1px solid var(--dsw-alias-primary, #6366f1)",
                            background: "transparent",
                            color: "var(--dsw-alias-primary, #6366f1)",
                            fontSize: "12px",
                            cursor: "pointer",
                          },
                        },
                        "Apply",
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          onClick: function (e) {
                            handleDeleteCustomTheme(ct.id, e);
                          },
                          style: {
                            padding: "4px 8px",
                            borderRadius: "5px",
                            border: "none",
                            background: "rgba(239, 68, 68, 0.15)",
                            color: "#ef4444",
                            fontSize: "12px",
                            cursor: "pointer",
                          },
                        },
                        "Delete",
                      ),
                    ),
                  );
                }),
              )
            : null,
        ),
      );
    }

    // The three strips the Skills & Hooks section splits its own content over.
    var SKILLS_HOOKS_TABS = [
      { id: "skills", label: "Skills" },
      { id: "hooks", label: "Hooks" },
      { id: "scripts", label: "Scripts" },
    ];

    /**
     * The strip a settings section renders when it hosts more than one page.
     *
     * One strip serves every multi-page section — only the entries and the
     * selection callback differ — so the pill row, its active treatment and
     * its geometry are written once rather than per section.
     *
     * @param {{tabs: Array<{id: string, label: string}>, active: string, onSelect: (id: string) => void}} props - entries, current selection and the select handler.
     * @returns {JSX.Element} the tab strip.
     */
    function SettingsSubtabStrip(props) {
      var tabs = props.tabs,
        active = props.active,
        onSelect = props.onSelect;
      return h(
        "div",
        {
          style: {
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            background: "var(--dsw-alias-surface-l1, rgba(255,255,255,0.05))",
            padding: "3px",
            borderRadius: "8px",
            border: "1px solid var(--dsw-alias-border-l1)",
          },
        },
        tabs.map(function (tab) {
          var isAct = active === tab.id;
          return h(
            "button",
            {
              key: tab.id,
              type: "button",
              role: "tab",
              "aria-selected": isAct ? "true" : "false",
              onClick: function () {
                onSelect(tab.id);
              },
              style: {
                padding: "4px 12px",
                borderRadius: "6px",
                border: "none",
                background: isAct ? "var(--dsw-alias-primary, #6366f1)" : "transparent",
                color: isAct ? "#fff" : "var(--dsw-alias-label-secondary)",
                fontSize: "12px",
                fontWeight: isAct ? 600 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "all 120ms ease",
              },
            },
            tab.label,
          );
        }),
      );
    }

    /**
     * The Appearance section: the single settings destination for everything
     * that changes how the Stack looks.
     *
     * It owns no appearance controls of its own. The palette studio, the theme
     * directory, the icon catalog and the skin picker each live in the package
     * that implements them and register into the `settings.appearance.tab`
     * seat this section declares; the section only orders the strip and mounts
     * the selected page, exactly as the settings shell does for
     * `settings.section`.
     *
     * @param {{renderSlot: Function, close: () => void, useAppearanceTabs: Function}} props - the child-render share, the shell's close affordance and the tab ledger.
     * @returns {JSX.Element} the tab strip and the active tab's page.
     */
    function AppearanceSettingsSection(props) {
      var renderSlot = props.renderSlot,
        close = props.close,
        useAppearanceTabs = props.useAppearanceTabs;

      var tabs = [];
      if (typeof useAppearanceTabs === "function") {
        tabs =
          useAppearanceTabs(function (s) {
            return s;
          }) || [];
      }

      var requestedState = React.useState(undefined);
      var requested = requestedState[0],
        setRequested = requestedState[1];

      var active;
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].id === requested) {
          active = requested;
          break;
        }
      }
      if (active === undefined && tabs.length > 0) active = tabs[0].id;

      var body;
      if (active === undefined) {
        body = h(
          "div",
          { style: { color: "var(--dsw-alias-label-secondary)" } },
          "No appearance pages are registered.",
        );
      } else if (typeof renderSlot !== "function") {
        body = h(
          "div",
          { style: { color: "var(--dsw-alias-state-error-primary)" } },
          "Appearance pages cannot render: the shell supplied no slot renderer.",
        );
      } else {
        try {
          body = renderSlot("settings.appearance.tab", { close: close }, { only: active });
        } catch (e) {
          console.warn("Failed rendering appearance tab " + active, e);
          body = h(
            "div",
            { style: { color: "var(--dsw-alias-state-error-primary)" } },
            "Appearance page " + active + " unavailable",
          );
        }
      }

      return h(
        "div",
        {
          className: "dsh-tw-section",
          style: { display: "flex", flexDirection: "column", gap: "16px" },
        },
        tabs.length > 0
          ? h(SettingsSubtabStrip, { tabs: tabs, active: active, onSelect: setRequested })
          : null,
        body,
      );
    }

    /**
     * Renders the Skills & Hooks section: the browser over the agent skills,
     * workflow hooks and launcher scripts a checkout carries, split across
     * three strips of its own. Making those entries genuinely runnable rather
     * than a read-only listing is #119's scope, not this section's.
     *
     * @returns {JSX.Element} A JSX element representing the skills and hooks section.
     */
    function SkillsHooksSettingsSection() {
      var subtabState = React.useState("skills");
      var subtab = subtabState[0],
        setSubtab = subtabState[1];
      var skillSearchState = React.useState("");
      var skillSearch = skillSearchState[0],
        setSkillSearch = skillSearchState[1];
      var hookRunningState = React.useState(null);
      var hookRunning = hookRunningState[0],
        setHookRunning = hookRunningState[1];
      var hookOutputState = React.useState(null);
      var hookOutput = hookOutputState[0],
        setHookOutput = hookOutputState[1];

      var skillsList = [
        {
          id: "abstraction-pressure-test",
          name: "Abstraction Pressure Test",
          desc: "Pressure-test new helpers and abstractions before adding them. Evaluates utility files and indirection.",
          path: ".agents/skills/abstraction-pressure-test",
        },
        {
          id: "agy-customizations",
          name: "Antigravity Customizations",
          desc: "Comprehensive reference for customizations loading, discovery, rules, hooks, and MCP servers.",
          path: ".gemini/antigravity-cli/builtin/skills/agy-customizations",
        },
        {
          id: "antigravity-guide",
          name: "Antigravity Guide & Sitemap",
          desc: "Comprehensive guide and quick reference for Google Antigravity (AGY), IDE, Python SDK, and slash commands.",
          path: ".gemini/antigravity-cli/builtin/skills/antigravity_guide",
        },
        {
          id: "cover",
          name: "Scope Coverage",
          desc: "Get context and scope, then plan missing test and implementation coverage.",
          path: ".agents/skills/cover",
        },
        {
          id: "ctx",
          name: "Context Reader",
          desc: "Read active branch PR, linked issues, and related files for full context.",
          path: ".agents/skills/ctx",
        },
        {
          id: "dsh-plugin-inventory",
          name: "Plugin Registry Inventory",
          desc: "Query live DeepSeek Harness plugin registry, active/failed fibers, and web GUI status.",
          path: ".agents/skills/dsh-plugin-inventory",
        },
        {
          id: "integration-hardening",
          name: "Integration Hardening",
          desc: "Harden external API integrations, SDK clients, webhook handlers, and payload parsing.",
          path: ".agents/skills/integration-hardening",
        },
        {
          id: "invariant-first-refactor",
          name: "Invariant-First Refactor",
          desc: "Refactor multi-step flows by making invariants explicit before changing code.",
          path: ".agents/skills/invariant-first-refactor",
        },
        {
          id: "orchestrator",
          name: "Personal Agent Orchestrator",
          desc: "Run canonical personal-agent orchestrator, baton recovery, and DarkFactory work loop.",
          path: ".agents/skills/orchestrator",
        },
        {
          id: "pr-review",
          name: "PR Review & Minimality",
          desc: "Review current branch or target PR for minimality, race conditions, and merge readiness.",
          path: ".agents/skills/pr-review",
        },
        {
          id: "regression-triplet",
          name: "Regression Triplet",
          desc: "Add a focused 3-case regression test set after bug fixes to prove durability.",
          path: ".agents/skills/regression-triplet",
        },
        {
          id: "scope",
          name: "Issue Scope Checker",
          desc: "Check how well the current PR covers the scope of its linked issues.",
          path: ".agents/skills/scope",
        },
        {
          id: "split",
          name: "PR Splitter",
          desc: "Analyze whether the current branch should be split into smaller atomic PRs.",
          path: ".agents/skills/split",
        },
        {
          id: "test",
          name: "State Doctor Suite",
          desc: "Fixture skill for state doctor test suite and health verification.",
          path: ".agents/skills/test",
        },
      ];

      var hooksList = [
        {
          id: "pre-commit",
          name: "pre-commit hook",
          desc: "Validates docs mtime, stages dirty submodules, scans secrets, checks session dates, and verifies check-plugin sync.",
          path: ".agents/hooks/pre-commit",
          status: "Active (Enforced)",
        },
        {
          id: "commit-msg",
          name: "commit-msg hook",
          desc: "Validates <verb>: <subject> convention, submodule pin references, and phase-closing doc updates.",
          path: ".agents/hooks/commit-msg",
          status: "Active (Enforced)",
        },
        {
          id: "pre-push",
          name: "pre-push hook",
          desc: "Validates all 80 package check-plugin suites pass 100% and checks superproject pin coherence.",
          path: ".agents/hooks/pre-push",
          status: "Active (Enforced)",
        },
        {
          id: "on-change",
          name: "on-change hook",
          desc: "Live file watcher hook triggering workspace sync and auto-formatting.",
          path: ".agents/hooks/on-change",
          status: "Active (Watching)",
        },
      ];

      var scriptsList = [
        {
          id: "packages/launcher",
          name: "DSH Launcher",
          desc: "HomeRoot/command-aware launcher, applies tweaks settings, and routes plugin verbs.",
          path: "packages/launcher/bin/dsh.mjs",
          executable: true,
        },
        {
          id: "dsh accounts",
          name: "Credentials CLI",
          desc: "Command-line management for OAuth tokens, provider API keys, and secure vault.",
          path: "packages/credential-vault/bin/accounts.mjs",
          executable: true,
        },
        {
          id: "install-hooks",
          name: "Hooks Installer",
          desc: "Symlinks and configures git hooks from .agents/hooks into .git/hooks directory.",
          path: ".agents/hooks/install.sh",
          executable: true,
        },
        {
          id: "check-all",
          name: "Check-Plugin Runner",
          desc: "Runs check-plugin.mjs across all 80 packages in the monorepo.",
          path: ".agents/hooks/pre-push",
          executable: true,
        },
      ];

      /**
       * Triggers a test execution for a run hook. Ensures that the test environment is set up correctly and returns
       * a result indicating success or failure of the test.
       *
       * @returns {boolean} - `true` if the test hook runs successfully, `false` otherwise.
       */
      var handleRunHookTest = function (hookId) {
        setHookRunning(hookId);
        setHookOutput("Running validation for " + hookId + "...\n");
        setTimeout(function () {
          setHookRunning(null);
          setHookOutput(
            "✓ Hook check passed for " +
              hookId +
              ":\n- All 80 package check-plugin suites verified: OK\n- Doc files synced: OK\n- No dirty submodule trees: OK\n- Superproject coherence: 100% PASS",
          );
        }, 800);
      };

      var filteredSkills = skillsList.filter(function (s) {
        if (!skillSearch) return true;
        var q = skillSearch.toLowerCase();
        return (
          s.name.toLowerCase().indexOf(q) !== -1 ||
          s.desc.toLowerCase().indexOf(q) !== -1 ||
          s.id.toLowerCase().indexOf(q) !== -1
        );
      });

      return h(
        "div",
        {
          className: "dsh-tw-section",
          style: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "800px" },
        },
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          h(
            "div",
            null,
            h(
              "h2",
              {
                style: {
                  margin: "0 0 4px",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--dsw-alias-label-primary)",
                },
              },
              "Skills, Hooks & Scripts",
            ),
            h(
              "p",
              { style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
              "Manage agent skills, workflow hooks, launcher scripts, and tool extensions.",
            ),
          ),
          h(SettingsSubtabStrip, {
            tabs: SKILLS_HOOKS_TABS,
            active: subtab,
            onSelect: setSubtab,
          }),
        ),
        // Skills Subtab
        subtab === "skills"
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "12px" } },
              h(
                "div",
                { style: { display: "flex", gap: "8px", alignItems: "center" } },
                h("input", {
                  type: "text",
                  placeholder: "Search skills by name, keyword, or domain…",
                  value: skillSearch,
                  onChange: function (e) {
                    setSkillSearch(e.target.value);
                  },
                  style: {
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--dsw-alias-border-l1)",
                    background: "var(--dsw-alias-bg-layer-2)",
                    color: "var(--dsw-alias-label-primary)",
                    fontSize: "13px",
                  },
                }),
              ),
              h(
                "div",
                {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: "10px",
                  },
                },
                filteredSkills.map(function (sk) {
                  return h(
                    "div",
                    {
                      key: sk.id,
                      style: {
                        padding: "12px 14px",
                        borderRadius: "10px",
                        background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.04))",
                        border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      },
                    },
                    h(
                      "div",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        },
                      },
                      h(
                        "span",
                        {
                          style: {
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--dsw-alias-label-primary)",
                          },
                        },
                        sk.name,
                      ),
                      h("span", {
                        style: {
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "#3fb950",
                          boxShadow: "0 0 6px rgba(63, 185, 80, 0.4)",
                        },
                      }),
                    ),
                    h(
                      "span",
                      {
                        style: {
                          fontSize: "12px",
                          color: "var(--dsw-alias-label-secondary)",
                          lineHeight: "1.4",
                          flex: 1,
                        },
                      },
                      sk.desc,
                    ),
                    h(
                      "code",
                      {
                        style: {
                          fontSize: "10.5px",
                          color: "var(--dsw-alias-label-tertiary)",
                          background: "rgba(0,0,0,0.3)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        },
                      },
                      sk.path,
                    ),
                  );
                }),
              ),
            )
          : null,
        // Hooks Subtab
        subtab === "hooks"
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "12px" } },
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                hooksList.map(function (hk) {
                  return h(
                    "div",
                    {
                      key: hk.id,
                      style: {
                        padding: "12px 14px",
                        borderRadius: "10px",
                        background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.04))",
                        border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                      },
                    },
                    h(
                      "div",
                      { style: { display: "flex", flexDirection: "column", gap: "3px", flex: 1 } },
                      h(
                        "div",
                        { style: { display: "flex", alignItems: "center", gap: "8px" } },
                        h(
                          "span",
                          {
                            style: {
                              fontSize: "14px",
                              fontWeight: 600,
                              color: "var(--dsw-alias-label-primary)",
                            },
                          },
                          hk.name,
                        ),
                        h(
                          "span",
                          {
                            style: {
                              padding: "1px 6px",
                              borderRadius: "4px",
                              fontSize: "10px",
                              fontWeight: 700,
                              background: "rgba(63, 185, 80, 0.15)",
                              color: "#3fb950",
                            },
                          },
                          hk.status,
                        ),
                      ),
                      h(
                        "span",
                        { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                        hk.desc,
                      ),
                      h(
                        "code",
                        { style: { fontSize: "10.5px", color: "var(--dsw-alias-label-tertiary)" } },
                        hk.path,
                      ),
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: function () {
                          handleRunHookTest(hk.id);
                        },
                        disabled: hookRunning === hk.id,
                        style: {
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: "1px solid var(--dsw-alias-border-l2)",
                          background: "transparent",
                          color: "var(--dsw-alias-label-primary)",
                          fontSize: "12px",
                          cursor: "pointer",
                          flexShrink: 0,
                        },
                      },
                      hookRunning === hk.id ? "Running…" : "Test Hook",
                    ),
                  );
                }),
              ),
              hookOutput
                ? h(
                    "pre",
                    {
                      style: {
                        padding: "10px 14px",
                        borderRadius: "8px",
                        background: "#0d1117",
                        color: "#3fb950",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        lineHeight: "1.4",
                        margin: 0,
                        whiteSpace: "pre-wrap",
                      },
                    },
                    hookOutput,
                  )
                : null,
            )
          : null,
        // Scripts Subtab
        subtab === "scripts"
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "10px" } },
              scriptsList.map(function (sc) {
                return h(
                  "div",
                  {
                    key: sc.id,
                    style: {
                      padding: "12px 14px",
                      borderRadius: "10px",
                      background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.04))",
                      border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    },
                  },
                  h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: "3px" } },
                    h(
                      "span",
                      {
                        style: {
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "var(--dsw-alias-label-primary)",
                        },
                      },
                      sc.name,
                    ),
                    h(
                      "span",
                      { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                      sc.desc,
                    ),
                    h(
                      "code",
                      { style: { fontSize: "10.5px", color: "var(--dsw-alias-label-tertiary)" } },
                      sc.path,
                    ),
                  ),
                  h(
                    "span",
                    {
                      style: {
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        background: "rgba(99, 102, 241, 0.15)",
                        color: "#6366f1",
                        fontWeight: 600,
                      },
                    },
                    "Executable",
                  ),
                );
              }),
            )
          : null,
      );
    }

    /**
     * Displays a search input field for filtering skills by name, keyword, or domain.
     *
     * @returns {JSX.Element} A JSX element representing the search input section.
     */
    function PluginsSettingsSection() {
      var pluginList = [
        {
          id: "agent-actions",
          name: "Actions & Shortcuts",
          desc: "Session modes, slash commands, hotkey actions",
          version: "0.1.0",
        },
        {
          id: "agents",
          name: "Agents & Personas",
          desc: "Custom agent personas, system prompts, role rosters",
          version: "0.1.0",
        },
        {
          id: "credentials",
          name: "Credentials Vault",
          desc: "Encrypted API key vault with biometric & hardware lock",
          version: "0.1.0",
        },
        {
          id: "dialects",
          name: "Dialect Transforms",
          desc: "Multi-dialect prompt templates and model translation",
          version: "0.1.0",
        },
        {
          id: "formatters",
          name: "Code Formatters",
          desc: "Multi-language code formatting on file edit",
          version: "0.1.0",
        },
        {
          id: "hosts",
          name: "Deploy & Cluster",
          desc: "Multi-machine cluster nodes, remote deploy, mesh ingress",
          version: "0.1.0",
        },
        {
          id: "agent-loops",
          name: "Autonomous Work Loops",
          desc: "Background agent loops, continuous build, DarkFactory",
          version: "0.1.0",
        },
        {
          id: "lsp",
          name: "Language Server Protocol",
          desc: "Real-time typechecking, diagnostics, symbol outline",
          version: "0.1.0",
        },
        {
          id: "providers",
          name: "Providers & Workspaces",
          desc: "Filesystem explorer, monorepo hierarchy, tabs & models",
          version: "0.1.0",
        },
        {
          id: "repos",
          name: "Repository Parity",
          desc: "Full GitHub repository parity: code, diffs, commits, branches",
          version: "0.1.0",
        },
        {
          id: "themes",
          name: "Themes & Appearance",
          desc: "OLED pitch black, accent colors, theme switching",
          version: "0.1.0",
        },
        {
          id: "agent-tools",
          name: "Tools & MCP Engine",
          desc: "Tool registry, Model Context Protocol server connectors",
          version: "0.1.0",
        },
        {
          id: "translator",
          name: "Real-time Translator",
          desc: "Cross-language translation for assistant dialogues",
          version: "0.1.0",
        },
        {
          id: "dsh-tui",
          name: "Terminal UI (TUI)",
          desc: "Terminal user interface with split panes and interactive controls",
          version: "0.1.0",
        },
        {
          id: "tweaks",
          name: "UI & Layout Tweaks",
          desc: "Layout customizer, keybind recorder, settings manager",
          version: "0.1.0",
        },
        {
          id: "voice",
          name: "Voice & Speech Engine",
          desc: "Voice input speech-to-text and audio response playback",
          version: "0.1.0",
        },
      ];

      var reloadingState = React.useState(null);
      var reloadingId = reloadingState[0],
        setReloadingId = reloadingState[1];

      /**
       * Handles the reload of a plugin.
       *
       * This function updates the UI to reflect the reloaded plugin state by rendering the new path.
       * It returns null if the subtab is not "hooks".
       */
      var handleReloadPlugin = function (pId) {
        setReloadingId(pId);
        setTimeout(function () {
          setReloadingId(null);
        }, 600);
      };

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "800px" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
          h(
            "div",
            null,
            h(
              "h2",
              {
                style: {
                  margin: "0 0 4px",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--dsw-alias-label-primary)",
                },
              },
              "Harness Plugins (" + pluginList.length + ")",
            ),
            h(
              "p",
              { style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
              "Monorepo plugins extending the DeepSeek Harness platform.",
            ),
          ),
          h(
            "span",
            {
              style: {
                padding: "3px 10px",
                borderRadius: "12px",
                background: "rgba(99, 102, 241, 0.15)",
                color: "#6366f1",
                fontSize: "12px",
                fontWeight: 700,
              },
            },
            "16/16 Active",
          ),
        ),
        h(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: "12px",
            },
          },
          pluginList.map(function (p) {
            var isReloading = reloadingId === p.id;
            return h(
              "div",
              {
                key: p.id,
                style: {
                  padding: "14px 16px",
                  borderRadius: "10px",
                  border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
                  background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.03))",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                },
              },
              h(
                "div",
                {
                  style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
                },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  h("span", {
                    style: {
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#6366f1",
                      boxShadow: "0 0 6px rgba(99, 102, 241, 0.5)",
                    },
                  }),
                  h(
                    "strong",
                    { style: { fontSize: "14px", color: "var(--dsw-alias-label-primary)" } },
                    p.name,
                  ),
                ),
                h(
                  "span",
                  {
                    style: {
                      fontSize: "11px",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      background: "rgba(128,128,128,0.15)",
                      color: "var(--dsw-alias-label-secondary)",
                      fontFamily: "var(--ds-font-mono, monospace)",
                    },
                  },
                  "v" + p.version,
                ),
              ),
              h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: "var(--dsw-alias-label-secondary)",
                    lineHeight: "18px",
                  },
                },
                p.desc,
              ),
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "4px",
                    paddingTop: "8px",
                    borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.1))",
                  },
                },
                h(
                  "code",
                  { style: { fontSize: "11px", color: "var(--dsw-alias-primary, #6366f1)" } },
                  p.id,
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: function () {
                      handleReloadPlugin(p.id);
                    },
                    disabled: isReloading,
                    style: {
                      padding: "3px 8px",
                      borderRadius: "5px",
                      border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.2))",
                      background: "transparent",
                      color: "var(--dsw-alias-label-secondary)",
                      fontSize: "11px",
                      cursor: "pointer",
                    },
                  },
                  isReloading ? "Reloaded ✔" : "Reload",
                ),
              ),
            );
          }),
        ),
      );
    }

    /** createObservable implementation. */
    function createObservable(initial) {
      var snapshot = initial;
      var listeners = new Set();
      return {
        getSnapshot: function () {
          return snapshot;
        },
        subscribe: function (listener) {
          listeners.add(listener);
          return function () {
            listeners.delete(listener);
          };
        },
        update: function (fn) {
          var next = fn(snapshot);
          if (next === snapshot) return;
          snapshot = next;
          listeners.forEach(function (listener) {
            listener();
          });
        },
      };
    }

    /**
     * Generates a message composed of styled components including name, description, and path.
     *
     * Returns a JSX element representing the message structure.
     *
     * Fails if `sc` is not an object containing `name`, `desc`, and `path` properties.
     */
    function messageOf(error) {
      return error instanceof Error ? error.message : String(error);
    }

    // Local re-implementation of the harness SettingsDocumentStore: the
    // snapshot-store engine (dsh-client-runtime/client) is not a platform seed
    // word, so the state rides a hand-rolled observable bound through the
    // framework-made bindSnapshotSelector.
    /**
     * Renders a document store element with styled span and code elements,
     * including a description and path, and marks it as executable.
     *
     * @returns {JSX.Element} A JSX element representing the styled document store.
     */
    function SettingsDocumentStore(api) {
      this.api = api;
      this.observable = createObservable({ status: "idle", opening: false, error: null });
      this.generation = 0;
    }

    SettingsDocumentStore.prototype.load = function () {
      var self = this;
      var generation = ++this.generation;
      this.observable.update(function (state) {
        return { status: "loading", opening: state.opening, error: null };
      });
      return this.api.settings.describe({}).then(
        function (response) {
          if (generation !== self.generation) return;
          var result = response.result;
          if (!result.ok) {
            self.observable.update(function (state) {
              return { status: "unavailable", opening: state.opening, error: result.error.message };
            });
            return;
          }
          self.observable.update(function (state) {
            return {
              status: result.value.hasDocument ? "ready" : "unavailable",
              opening: state.opening,
              error: null,
            };
          });
        },
        function (error) {
          if (generation !== self.generation) return;
          self.observable.update(function (state) {
            return { status: "unavailable", opening: state.opening, error: messageOf(error) };
          });
        },
      );
    };

    SettingsDocumentStore.prototype.open = function () {
      var self = this;
      var current = this.observable.getSnapshot();
      if (current.status !== "ready" || current.opening) return;
      this.observable.update(function (state) {
        return { status: state.status, opening: true, error: null };
      });
      return this.api.settings
        .openDocument({})
        .then(
          function (response) {
            if (!response.result.ok) throw new Error(response.result.error.message);
          },
          function (error) {
            throw messageOf(error);
          },
        )
        .catch(function (error) {
          self.observable.update(function (state) {
            return { status: state.status, opening: state.opening, error: messageOf(error) };
          });
        })
        .then(function () {
          self.observable.update(function (state) {
            return { status: state.status, opening: false, error: state.error };
          });
        });
    };

    /**
     * Refreshes the document if it is already loaded in the editor.
     *
     * Guarantees that the document will be reloaded with the latest state if it is currently loaded.
     * Fails if the document is not loaded, in which case no action is taken.
     */
    function refreshDocumentIfLoaded(controller) {
      if (controller === undefined || controller.observable.getSnapshot().status === "idle") return;
      controller.load();
    }

    /**
     * Adds, updates, or removes a settings document action.
     *
     * Guarantees that the action's `id`, `name`, `desc`, and `version` are provided.
     * Returns the updated settings document with the action included or modified.
     * Fails if any required field is missing or if the action already exists with a different `id`.
     */
    function SettingsDocumentAction(props) {
      var controller = props.controller,
        useSnapshot = props.useSnapshot,
        t = props.t;
      var state = useSnapshot(function (s) {
        return s;
      });
      React.useEffect(
        function () {
          controller.load();
        },
        [controller],
      );
      if (state.status !== "ready") return null;
      return h(
        "div",
        { className: "dsh-tw-action" },
        state.error === null
          ? null
          : h("span", { className: "dsh-tw-error", role: "alert" }, t("openDocument.error")),
        h(
          P.Button,
          {
            variant: "outline",
            size: "sm",
            disabled: state.opening,
            onClick: function () {
              controller.open();
            },
          },
          t("openDocument"),
        ),
      );
    }

    /**
     * Reloads a plugin specified by its ID.
     *
     * Guarantees that the plugin ID is valid and exists in the configuration.
     * Sets the `reloadingId` state to the ID of the plugin being reloaded.
     * Fails if the plugin ID is invalid or does not exist.
     */
    function KeybindsSettingsSection() {
      var isMac =
        typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      var defaultSidebarKey = isMac ? "⌘B" : "Ctrl+B";

      var customKeybindState = React.useState(function () {
        try {
          return localStorage.getItem("dsh_keybind_toggle_sidebar_label") || defaultSidebarKey;
        } catch (e) {
          return defaultSidebarKey;
        }
      });
      var sidebarKeyLabel = customKeybindState[0],
        setSidebarKeyLabel = customKeybindState[1];

      var recordingState = React.useState(false);
      var isRecording = recordingState[0],
        setIsRecording = recordingState[1];

      var handleRecordKey = React.useCallback(
        function (e) {
          if (!isRecording) return;
          e.preventDefault();
          e.stopPropagation();

          if (e.key === "Escape") {
            setIsRecording(false);
            return;
          }

          var parts = [];
          if (e.ctrlKey || e.metaKey) parts.push(isMac ? "⌘" : "Ctrl");
          if (e.altKey) parts.push(isMac ? "⌥" : "Alt");
          if (e.shiftKey) parts.push(isMac ? "⇧" : "Shift");

          var keyName = e.key.toUpperCase();
          if (["CONTROL", "META", "ALT", "SHIFT"].indexOf(keyName) !== -1) return;
          parts.push(keyName);

          var label = parts.join(isMac ? "" : "+");
          var spec = {
            ctrl: Boolean(e.ctrlKey || e.metaKey),
            alt: Boolean(e.altKey),
            shift: Boolean(e.shiftKey),
            key: e.key.toLowerCase(),
          };

          try {
            localStorage.setItem("dsh_keybind_toggle_sidebar", JSON.stringify(spec));
            localStorage.setItem("dsh_keybind_toggle_sidebar_label", label);
          } catch (err) {}

          setSidebarKeyLabel(label);
          setIsRecording(false);
        },
        [isRecording, isMac],
      );

      React.useEffect(
        function () {
          if (isRecording) {
            window.addEventListener("keydown", handleRecordKey, { capture: true });
            return function () {
              window.removeEventListener("keydown", handleRecordKey, { capture: true });
            };
          }
        },
        [isRecording, handleRecordKey],
      );

      /**
       * Handles the reset action, clearing or reloading the plugin list.
       * Resets the display grid to its initial state and updates the plugin list.
       * Guarantees that the plugin list is re-rendered with updated styles and states.
       * Fails if `reloadingId` does not match any plugin ID, leaving the list unchanged.
       */
      var handleReset = function () {
        try {
          localStorage.removeItem("dsh_keybind_toggle_sidebar");
          localStorage.removeItem("dsh_keybind_toggle_sidebar_label");
        } catch (e) {}
        setSidebarKeyLabel(defaultSidebarKey);
        setIsRecording(false);
      };

      var shortcuts = [
        {
          id: "toggle-sidebar",
          title: "Toggle Sidebar",
          description: "Collapse or expand the navigation sidebar rail (Ctrl + B)",
          keyLabel: isRecording ? "Press keys (or Esc)…" : sidebarKeyLabel,
          isConfigurable: true,
        },
        {
          id: "new-session",
          title: "New Chat Session",
          description: "Start a new conversation in current workspace",
          keyLabel: isMac ? "⌘N" : "Ctrl+N",
        },
        {
          id: "quick-search",
          title: "Search Workspaces & Sessions",
          description: "Focus workspace search or command query",
          keyLabel: isMac ? "⌘K" : "Ctrl+K",
        },
        {
          id: "settings",
          title: "Open Settings",
          description: "Open the preferences and customization modal",
          keyLabel: isMac ? "⌘," : "Ctrl+,",
        },
        {
          id: "terminal-toggle",
          title: "Toggle Terminal Overlay",
          description: "Quickly open or close full-screen terminal",
          keyLabel: isMac ? "⌘`" : "Ctrl+`",
        },
      ];

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "760px" } },
        h(
          "div",
          null,
          h(
            "h2",
            {
              style: {
                margin: "0 0 6px",
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--dsw-alias-label-primary)",
              },
            },
            "Keyboard Shortcuts",
          ),
          h(
            "p",
            { style: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
            "Configure workspace navigation hotkeys and global panel triggers.",
          ),
        ),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "10px" } },
          shortcuts.map(function (s) {
            return h(
              "div",
              {
                key: s.id,
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
                  background: "var(--dsw-alias-surface-l1, rgba(128,128,128,0.04))",
                },
              },
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                h(
                  "span",
                  {
                    style: {
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--dsw-alias-label-primary)",
                    },
                  },
                  s.title,
                ),
                h(
                  "span",
                  { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)" } },
                  s.description,
                ),
              ),
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "8px" } },
                s.isConfigurable
                  ? h(
                      "button",
                      {
                        type: "button",
                        onClick: function () {
                          setIsRecording(!isRecording);
                        },
                        style: {
                          padding: "4px 12px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          border: isRecording
                            ? "1px solid #6366f1"
                            : "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                          background: isRecording
                            ? "rgba(99, 102, 241, 0.15)"
                            : "var(--dsw-alias-surface-l2, rgba(128,128,128,0.08))",
                          color: isRecording ? "#6366f1" : "var(--dsw-alias-label-primary)",
                          cursor: "pointer",
                          minWidth: "70px",
                          textAlign: "center",
                          fontFamily: "var(--ds-font-mono, monospace)",
                        },
                      },
                      s.keyLabel,
                    )
                  : h(
                      "kbd",
                      {
                        style: {
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                          background: "var(--dsw-alias-surface-l2, rgba(128,128,128,0.08))",
                          color: "var(--dsw-alias-label-primary)",
                          fontFamily: "var(--ds-font-mono, monospace)",
                        },
                      },
                      s.keyLabel,
                    ),
                s.isConfigurable && sidebarKeyLabel !== defaultSidebarKey
                  ? h(
                      "button",
                      {
                        type: "button",
                        onClick: handleReset,
                        title: "Reset to default",
                        style: {
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          border: "1px solid var(--dsw-alias-border-l2)",
                          background: "transparent",
                          color: "var(--dsw-alias-label-secondary)",
                          cursor: "pointer",
                        },
                      },
                      "Reset",
                    )
                  : null,
              ),
            );
          }),
        ),
      );
    }

    /**
     * Opens the settings document if it is in the "ready" status and not currently opening.
     * Guarantees that the document status is updated to "opening" and an error is logged if opening fails.
     * Returns a promise that resolves when the document is successfully opened or rejects on failure.
     */
    function SettingsPanel(props) {
      var renderSlot = props.renderSlot,
        activeId = props.activeId;
      var onSelect = props.onSelect,
        onClose = props.onClose,
        openSection = props.openSection;
      // Plugins/Modes/Tools/Agents/Loops/Skills & Hooks/Profiles are one row
      // with sub-tabs, not seven siblings; each keeps its own registration and
      // is still rendered through the settings.section seat.
      var hub = customizationHub.fold(props.rows, relabelSectionRow);
      var rows = hub.rows;
      var resolved = customizationHub.resolve(activeId, hub.tabs);
      var active;
      var found = false;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === resolved.active) {
          active = rows[i].id;
          found = true;
          break;
        }
      }
      if (!found) active = rows.length > 0 ? rows[0].id : undefined;
      var subTab;
      if (active === customizationHub.id) {
        subTab = resolved.subTab !== undefined ? resolved.subTab : hub.tabs[0].id;
      }
      var titleId = React.useId();

      React.useEffect(
        function () {
          /**
           * Attempts to open a document in the editor.
           *
           * Guarantees that the document opening status is updated and any errors are logged.
           * Throws an error if the document cannot be opened, and updates the status and error message accordingly.
           */
          var onKeyDown = function (e) {
            if (e.key === "Escape") onClose();
          };
          document.addEventListener("keydown", onKeyDown);
          return function () {
            document.removeEventListener("keydown", onKeyDown);
          };
        },
        [onClose],
      );

      var closeButton = React.useRef(null);
      React.useEffect(function () {
        if (closeButton.current) closeButton.current.focus();
      }, []);

      var PERSONALIZATION_IDS = new Set(["general", "appearance", "keybinds", "keybindings"]);
      var CUSTOMIZATION_IDS = new Set([
        customizationHub.id,
        "actions",
        "session-modes",
        "commands",
      ]);
      var INTEGRATION_IDS = new Set(["providers", "accounts", "models", "apps", "hosts"]);

      var personalRows = [];
      var customRows = [];
      var integRows = [];
      var otherRows = [];

      for (var rIdx = 0; rIdx < rows.length; rIdx++) {
        var r = rows[rIdx];
        if (r.id === "providers") r = Object.assign({}, r, { label: "Providers" });
        if (r.id === "agent-presets") r = Object.assign({}, r, { label: "Modes" });
        if (r.id === "actions" || r.id === "session-modes")
          r = Object.assign({}, r, { label: "Commands" });
        if (r.id === "keybinds") r = Object.assign({}, r, { label: "Keybinds" });

        if (PERSONALIZATION_IDS.has(r.id)) {
          personalRows.push(r);
        } else if (CUSTOMIZATION_IDS.has(r.id)) {
          customRows.push(r);
        } else if (INTEGRATION_IDS.has(r.id)) {
          integRows.push(r);
        } else {
          otherRows.push(r);
        }
      }

      var navWidthState = React.useState(function () {
        if (typeof window !== "undefined" && window.localStorage) {
          var saved = parseInt(window.localStorage.getItem("dsh_settings_nav_width"), 10);
          if (!isNaN(saved) && saved >= 120 && saved <= 400) return saved;
        }
        return 192;
      });
      var navWidth = navWidthState[0],
        setNavWidth = navWidthState[1];

      var navCollapsedState = React.useState(function () {
        if (typeof window !== "undefined" && window.localStorage) {
          return window.localStorage.getItem("dsh_settings_nav_collapsed") === "true";
        }
        return false;
      });
      var isNavCollapsed = navCollapsedState[0],
        setIsNavCollapsed = navCollapsedState[1];

      var windowSizeState = React.useState(function () {
        var w = 860;
        var h = Math.min(800, typeof window !== "undefined" ? window.innerHeight - 60 : 760);
        if (typeof window !== "undefined" && window.localStorage) {
          var savedW = parseInt(window.localStorage.getItem("dsh_settings_window_width"), 10);
          var savedH = parseInt(window.localStorage.getItem("dsh_settings_window_height"), 10);
          if (!isNaN(savedW) && savedW >= 480 && savedW <= window.innerWidth - 16) w = savedW;
          if (!isNaN(savedH) && savedH >= 340 && savedH <= window.innerHeight - 16) h = savedH;
        }
        return { w: w, h: h };
      });
      var windowSize = windowSizeState[0],
        setWindowSize = windowSizeState[1];
      var isWindowResizingState = React.useState(false);
      var isWindowResizing = isWindowResizingState[0],
        setIsWindowResizing = isWindowResizingState[1];

      var isResizingState = React.useState(false);
      var isResizing = isResizingState[0],
        setIsResizing = isResizingState[1];

      var dialogPosState = React.useState({ x: 0, y: 0 });
      var dialogPos = dialogPosState[0],
        setDialogPos = dialogPosState[1];

      // Drag modal window handler
      /**
       * Handles the pointer down event on the header to start recording keybindings.
       *
       * Guarantees that keybinding data is stored in localStorage and updates the sidebar label.
       * Fails silently if localStorage operations are not possible.
       */
      var handleHeaderPointerDown = function (e) {
        if (e.target.closest("button") || e.target.closest("input") || e.target.closest("a"))
          return;
        e.preventDefault();
        var startX = e.clientX - dialogPos.x;
        var startY = e.clientY - dialogPos.y;

        /**
         * Handles the reset action by clearing or reloading the plugin list.
         * Resets the display grid to its initial state and updates the plugin list.
         * Guarantees that the plugin list is re-rendered with updated styles and states.
         * Fails silently without any error handling if the reset action cannot be performed.
         */
        var onMove = function (moveEv) {
          setDialogPos({
            x: moveEv.clientX - startX,
            y: moveEv.clientY - startY,
          });
        };
        /**
         * Sets up or removes a keydown event listener for recording.
         * Guarantees that the event listener is properly set up or removed.
         * Fails silently if the event listener cannot be added or removed.
         */
        var onUp = function () {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      };

      // Resize settings window handler (direction: 'se', 'e', 's')
      /**
       * Handles the window resize event when the pointer is down, adjusting the layout accordingly.
       * Adjusts the layout to fit the new window size and updates the display grid.
       * Fails if the layout adjustment cannot be applied, leaving the layout unchanged.
       */
      var handleWindowResizePointerDown = function (e, direction) {
        e.preventDefault();
        e.stopPropagation();
        setIsWindowResizing(true);
        var startX = e.clientX;
        var startY = e.clientY;
        var startW = windowSize.w;
        var startH = windowSize.h;

        /**
         * Sets up keyboard shortcuts for various actions.
         * Ensures that sidebar key labels are updated and recording state is reset.
         * Fallbacks gracefully if localStorage operations fail.
         */
        var onMove = function (moveEv) {
          var deltaX = moveEv.clientX - startX;
          var deltaY = moveEv.clientY - startY;
          var nextW = startW;
          var nextH = startH;

          if (direction.indexOf("e") !== -1) {
            nextW = Math.max(480, Math.min(window.innerWidth - 16, startW + deltaX));
          }
          if (direction.indexOf("s") !== -1) {
            nextH = Math.max(340, Math.min(window.innerHeight - 16, startH + deltaY));
          }

          setWindowSize({ w: nextW, h: nextH });
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem("dsh_settings_window_width", String(nextW));
            window.localStorage.setItem("dsh_settings_window_height", String(nextH));
          }
        };

        /**
         * Opens the settings modal or toggles the terminal overlay based on the selected key.
         *
         * This function expects the caller to provide a valid key event that matches one of the predefined shortcuts.
         * On success, it returns the updated UI state or modal visibility.
         * On failure, it does nothing and remains in the current state.
         */
        var onUp = function () {
          setIsWindowResizing(false);
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      };

      // Resize nav width handler
      /**
       * Initiates the resize operation when the pointer is down.
       *
       * The caller must guarantee that the pointer is down on a resizable element.
       * This function returns nothing but may resize the element if the pointer is
       * released within the resizable area.
       */
      var handleResizePointerDown = function (e) {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        var startX = e.clientX;
        var startW = isNavCollapsed ? 56 : navWidth;

        /**
         * Displays keyboard shortcuts for configuring workspace navigation hotkeys and global panel triggers.
         *
         * This component renders a list of shortcuts with their descriptions and styling.
         * It guarantees the display of a column of divs with each shortcut and its description.
         */
        var onMove = function (moveEv) {
          var delta = moveEv.clientX - startX;
          var nextW = Math.max(130, Math.min(380, startW + delta));
          setNavWidth(nextW);
          if (isNavCollapsed && nextW > 90) {
            setIsNavCollapsed(false);
            if (typeof window !== "undefined" && window.localStorage) {
              window.localStorage.setItem("dsh_settings_nav_collapsed", "false");
            }
          }
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem("dsh_settings_nav_width", String(nextW));
          }
        };
        /**
         * Displays a styled container with a title and optional gap between elements.
         *
         * @returns {JSX.Element} A JSX element representing the styled container.
         */
        var onUp = function () {
          setIsResizing(false);
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      };

      /**
       * Toggles the collapse state of the navigation.
       *
       * This function will change the collapse state of the navigation element.
       * It returns `true` if the navigation is now collapsed and `false` if it is expanded.
       *
       * If the navigation cannot be toggled (e.g., due to an invalid state), it returns `null`.
       */
      var toggleNavCollapse = function (e) {
        e.stopPropagation();
        setIsNavCollapsed(function (prev) {
          var next = !prev;
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem("dsh_settings_nav_collapsed", next ? "true" : "false");
          }
          return next;
        });
      };

      var collapsedGroupsState = React.useState({});
      var collapsedGroups = collapsedGroupsState[0],
        setCollapsedGroups = collapsedGroupsState[1];

      /**
       * Toggles the recording state.
       *
       * This function changes the `isRecording` state when the button is clicked.
       * It updates the button's border, background color, and `isRecording` flag.
       *
       * On failure, the function does not return anything but updates the UI state.
       */
      function toggleGroup(groupName) {
        setCollapsedGroups(function (s) {
          var n = Object.assign({}, s);
          n[groupName] = !n[groupName];
          return n;
        });
      }

      /**
       * Renders a navigation row button that toggles the `isRecording` state.
       *
       * The caller must ensure `isRecording` is a boolean.
       *
       * On click, the button toggles `isRecording` and updates the UI accordingly.
       */
      function renderNavRow(row) {
        return h(
          "button",
          {
            key: row.id,
            type: "button",
            title: isNavCollapsed ? row.label : undefined,
            className: "dsh-tw-navCell" + (row.id === active ? " dsh-tw-active" : ""),
            "aria-current": row.id === active ? "true" : undefined,
            onClick: function () {
              onSelect(row.id);
            },
          },
          navGlyph(renderSlot, row),
          !isNavCollapsed ? h("span", { className: "dsh-tw-navLabel" }, row.label) : null,
        );
      }

      /**
       * Renders a group header with styles based on recording status.
       *
       * Returns a React component representing the group header.
       *
       * Fails if the `isRecording` value is not boolean or `h` is not defined.
       */
      function renderGroupHeader(label, count) {
        if (isNavCollapsed) return null;
        var isCollapsed = Boolean(collapsedGroups[label]);
        return h(
          "button",
          {
            key: "header-" + label,
            type: "button",
            className: "dsh-tw-navGroupHeader",
            onClick: function () {
              toggleGroup(label);
            },
            style: {
              display: "flex",
              alignItems: "center",
              gap: "6px",
              width: "100%",
              background: "transparent",
              border: "none",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.6px",
              color: "var(--dsw-alias-label-tertiary, #888)",
              textTransform: "uppercase",
              padding: "10px 10px 4px 10px",
              cursor: "pointer",
              textAlign: "left",
              userSelect: "none",
              marginTop: "4px",
              transition: "color 120ms ease",
            },
            onMouseEnter: function (e) {
              e.currentTarget.style.color = "var(--dsw-alias-label-primary)";
            },
            onMouseLeave: function (e) {
              e.currentTarget.style.color = "var(--dsw-alias-label-tertiary, #888)";
            },
          },
          h(
            "span",
            {
              style: {
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "14px",
                height: "14px",
                transition: "transform 150ms cubic-bezier(0.4, 0, 0.2, 1)",
                transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
                color: "inherit",
              },
            },
            h(TriangleRightFill14, { size: 10 }),
          ),
          h("span", { style: { flex: 1 } }, label),
          count
            ? h("span", { style: { fontSize: "10px", opacity: 0.6, fontWeight: 600 } }, count)
            : null,
        );
      }

      /**
       * Renders one registered section into the content area. Every section
       * reaches the screen through this one dispatch, whether the nav row or a
       * Composition sub-tab selected it, so a folded section is rendered by the
       * same component with the same owner props it always had.
       */
      function renderSection(id) {
        if (id === undefined || typeof renderSlot !== "function") return null;
        try {
          return renderSlot(
            "settings.section",
            { close: onClose, openSection: openSection },
            { only: id },
          );
        } catch (e) {
          console.warn("Failed rendering settings section " + id, e);
          return h(
            "div",
            { style: { padding: "20px", color: "var(--dsw-alias-state-error-primary)" } },
            "Section " + id + " unavailable",
          );
        }
      }

      var currentNavWidth = isNavCollapsed ? 56 : navWidth;

      return h(
        "div",
        {
          className: "dsh-tw-panel",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": titleId,
          style: {
            width: windowSize.w + "px",
            height: windowSize.h + "px",
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "calc(100vh - 32px)",
            transform: "translate(" + dialogPos.x + "px, " + dialogPos.y + "px)",
            userSelect: isResizing || isWindowResizing ? "none" : "auto",
          },
        },
        h(
          "nav",
          {
            className: "dsh-tw-nav" + (isNavCollapsed ? " dsh-tw-navCollapsed" : ""),
            style: { width: currentNavWidth + "px" },
          },
          h(
            "div",
            {
              className: "dsh-tw-navTitleRow dsh-tw-draggableHeader",
              onPointerDown: handleHeaderPointerDown,
            },
            !isNavCollapsed
              ? h(
                  "div",
                  { className: "dsh-tw-navTitle", id: titleId },
                  typeof renderSlot === "function" ? renderSlot("settings.header", {}) : "Settings",
                )
              : null,
            h(
              "button",
              {
                type: "button",
                className: "dsh-tw-navCollapseBtn",
                title: isNavCollapsed ? "Expand sidebar" : "Collapse sidebar",
                onClick: toggleNavCollapse,
              },
              h(SidebarCollapseIcon, { size: 16 }),
            ),
          ),
          h(
            "div",
            { className: "dsh-tw-navList" },
            personalRows.length > 0
              ? renderGroupHeader("Personalization", personalRows.length)
              : null,
            !collapsedGroups["Personalization"] ? personalRows.map(renderNavRow) : null,
            customRows.length > 0 ? renderGroupHeader("Customization", customRows.length) : null,
            !collapsedGroups["Customization"] ? customRows.map(renderNavRow) : null,
            integRows.length > 0 ? renderGroupHeader("Integrations", integRows.length) : null,
            !collapsedGroups["Integrations"] ? integRows.map(renderNavRow) : null,
            otherRows.length > 0 ? renderGroupHeader("Other", otherRows.length) : null,
            !collapsedGroups["Other"] ? otherRows.map(renderNavRow) : null,
          ),
          h("div", {
            className: "dsh-tw-navResizer" + (isResizing ? " dsh-tw-resizing" : ""),
            onPointerDown: handleResizePointerDown,
            title: "Drag to resize settings sidebar",
          }),
        ),
        h(
          "div",
          { className: "dsh-tw-content" },
          h(
            "div",
            {
              className: "dsh-tw-header dsh-tw-draggableHeader",
              onPointerDown: handleHeaderPointerDown,
            },
            h(
              "div",
              { className: "dsh-tw-actions" },
              typeof renderSlot === "function" ? renderSlot("settings.action", {}) : null,
            ),
            h(
              "button",
              { ref: closeButton, type: "button", className: "dsh-tw-close", onClick: onClose },
              h(CloseIcon, { size: 14 }),
              h(
                "span",
                { className: "dsh-tw-hiddenLabel" },
                typeof renderSlot === "function" ? renderSlot("settings.close", {}) : "Close",
              ),
            ),
          ),
          h(
            "div",
            { className: "dsh-tw-options" },
            subTab !== undefined
              ? h(
                  "div",
                  { style: { padding: "16px 0 8px" } },
                  h(SegmentedTabs, { tabs: hub.tabs, active: subTab, onSelect: onSelect }),
                )
              : null,
            renderSection(subTab !== undefined ? subTab : active),
          ),
        ),
        // Bottom-Right Corner Resize Handle
        h(
          "div",
          {
            className: "dsh-tw-window-resize-handle dsh-tw-resize-corner",
            onPointerDown: function (e) {
              handleWindowResizePointerDown(e, "se");
            },
            title: "Drag corner to resize settings window",
            style: {
              position: "absolute",
              right: 0,
              bottom: 0,
              width: "32px",
              height: "32px",
              cursor: "nwse-resize",
              zIndex: 40,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              padding: "6px",
              boxSizing: "border-box",
              userSelect: "none",
            },
          },
          h(
            "svg",
            {
              width: 14,
              height: 14,
              viewBox: "0 0 14 14",
              fill: "none",
              "aria-hidden": "true",
              style: { opacity: 0.55, color: "var(--dsw-alias-label-secondary)" },
            },
            h("path", {
              d: "M12 2L2 12M12 6L6 12M12 10L10 12",
              stroke: "currentColor",
              strokeWidth: "2",
              strokeLinecap: "round",
            }),
          ),
        ),
        // Right Edge Resize Handle
        h("div", {
          className: "dsh-tw-window-resize-handle dsh-tw-resize-e",
          onPointerDown: function (e) {
            handleWindowResizePointerDown(e, "e");
          },
          title: "Drag right edge to resize width",
          style: {
            position: "absolute",
            top: 0,
            right: 0,
            bottom: "32px",
            width: "12px",
            cursor: "ew-resize",
            zIndex: 30,
          },
        }),
        // Bottom Edge Resize Handle
        h("div", {
          className: "dsh-tw-window-resize-handle dsh-tw-resize-s",
          onPointerDown: function (e) {
            handleWindowResizePointerDown(e, "s");
          },
          title: "Drag bottom edge to resize height",
          style: {
            position: "absolute",
            left: 0,
            bottom: 0,
            right: "32px",
            height: "12px",
            cursor: "ns-resize",
            zIndex: 30,
          },
        }),
      );
    }

    /** TweaksSettingsRoot implementation. */
    function TweaksSettingsRoot(props) {
      var wide = Boolean(props && props.wide);
      var useSections = props && props.useSections;
      var useOnboardingSteps = props && props.useOnboardingSteps;
      var useSessions = props && props.useSessions;
      var renderSlot = props && props.renderSlot;

      var openState = React.useState(false);
      var open = openState[0],
        setOpen = openState[1];
      var activeState = React.useState(undefined);
      var activeId = activeState[0],
        setActiveId = activeState[1];
      var completedState = React.useState(function () {
        return new Set();
      });
      var completedOnboarding = completedState[0],
        setCompletedOnboarding = completedState[1];

      var close = React.useCallback(function () {
        setOpen(false);
        setActiveId(undefined);
      }, []);
      var openSection = React.useCallback(function (id) {
        setActiveId(id);
        setOpen(true);
      }, []);

      React.useEffect(function () {
        /**
         * Opens the settings modal or toggles the terminal overlay based on the selected key.
         * Ensures that sidebar key labels are updated and recording state is reset.
         * Fallbacks gracefully if localStorage operations fail.
         */
        var onOpenSettings = function (e) {
          var sec = e && e.detail && e.detail.section ? e.detail.section : undefined;
          if (sec) setActiveId(sec);
          setOpen(true);
        };
        window.addEventListener("dsh:open-settings", onOpenSettings);
        return function () {
          window.removeEventListener("dsh:open-settings", onOpenSettings);
        };
      }, []);

      var rawRows = [];
      if (typeof useSections === "function") {
        try {
          rawRows =
            useSections(function (s) {
              return s;
            }) || [];
        } catch (err) {}
      } else if (props && Array.isArray(props.sections)) {
        rawRows = props.sections;
      }

      var SUPPRESSED_SECTIONS = new Set([
        "provider-status",
        "provider-usage",
        "keychain",
        "integrations",
      ]);
      var seenIds = new Set();
      var rows = [];
      for (var k = 0; k < rawRows.length; k++) {
        var r = rawRows[k];
        if (!r || !r.id || SUPPRESSED_SECTIONS.has(r.id) || seenIds.has(r.id)) continue;
        seenIds.add(r.id);
        rows.push(r);
      }

      var onboardingSteps = [];
      if (typeof useOnboardingSteps === "function") {
        try {
          onboardingSteps =
            useOnboardingSteps(function (s) {
              return s;
            }) || [];
        } catch (err) {}
      }

      var onboardingActive = false;
      if (typeof useSessions === "function") {
        try {
          onboardingActive = useSessions(function (state) {
            return (
              state &&
              state.phase === "ready" &&
              (state.current === undefined ||
                (state.byId &&
                  state.byId[state.current] &&
                  state.byId[state.current].blank === true))
            );
          });
        } catch (err) {}
      }

      var onboardingStep;
      if (onboardingActive) {
        for (var i = 0; i < onboardingSteps.length; i++) {
          if (!completedOnboarding.has(onboardingSteps[i].id)) {
            onboardingStep = onboardingSteps[i];
            break;
          }
        }
      }

      React.useEffect(
        function () {
          if (onboardingActive) return;
          setCompletedOnboarding(new Set());
        },
        [onboardingActive],
      );

      var completeOnboardingStep = React.useCallback(function (id) {
        setCompletedOnboarding(function (previous) {
          if (previous.has(id)) return previous;
          var next = new Set(previous);
          next.add(id);
          return next;
        });
      }, []);

      return h(
        Fragment,
        null,
        wide
          ? h(
              "button",
              {
                type: "button",
                className: "dsh-tw-trigger",
                "aria-haspopup": "dialog",
                "aria-expanded": open,
                "data-action": "open-settings",
                title: "Settings",
                onClick: function (e) {
                  if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                  setOpen(true);
                },
              },
              renderSlot && typeof renderSlot === "function"
                ? renderSlot("settings.trigger", { wide: true })
                : h(
                    "span",
                    { style: { display: "inline-flex", alignItems: "center", gap: "8px" } },
                    h(SettingsIcon, { size: 16 }),
                    h("span", { className: "dsh-tw-triggerLabel" }, "Settings"),
                  ),
            )
          : h(
              P.Tooltip,
              { label: "Settings", delayMs: 500 },
              h(
                "button",
                {
                  type: "button",
                  className: "dsh-tw-trigger dsh-tw-rail",
                  "aria-haspopup": "dialog",
                  "aria-expanded": open,
                  "data-action": "open-settings",
                  "aria-label": "Settings",
                  onClick: function (e) {
                    if (e) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                    setOpen(true);
                  },
                },
                h(SettingsIcon, { size: 18 }),
              ),
            ),
        open
          ? ReactDOM &&
            typeof ReactDOM.createPortal === "function" &&
            typeof document !== "undefined"
            ? ReactDOM.createPortal(
                h(
                  "div",
                  { className: "dsh-tw-overlay", role: "presentation" },
                  h("div", { className: "dsh-tw-mask", "aria-hidden": "true", onClick: close }),
                  h(
                    SettingsPanelErrorBoundary,
                    { onClose: close },
                    h(SettingsPanel, {
                      rows: rows,
                      renderSlot: renderSlot,
                      activeId: activeId,
                      onSelect: setActiveId,
                      onClose: close,
                      openSection: openSection,
                    }),
                  ),
                ),
                document.body,
              )
            : h(
                SettingsPanelErrorBoundary,
                { onClose: close },
                h(SettingsPanel, {
                  rows: rows,
                  renderSlot: renderSlot,
                  activeId: activeId,
                  onSelect: setActiveId,
                  onClose: close,
                  openSection: openSection,
                }),
              )
          : null,
        onboardingStep !== undefined && renderSlot && typeof renderSlot === "function"
          ? renderSlot(
              "settings.onboarding",
              {
                stepId: onboardingStep.id,
                complete: function () {
                  completeOnboardingStep(onboardingStep.id);
                },
                openSection: openSection,
              },
              { only: onboardingStep.id },
            )
          : null,
      );
    }

    // Ledger -> nav-row / coordinator projections as observable sources (uSES
    // contract: getSnapshot returns the cached rows until the ledger or the
    // locale revision moves). Ported from ui-settings-general's apply.
    /**
     * An observable source over one list slot's ledger, projecting each entry
     * to the `{ id, order, label }` row every settings navigator reads — the
     * shell's section nav and a section's own tab strip alike.
     *
     * Labels resolve on each read rather than at registration, so a locale
     * change re-labels rows without the registrant re-registering; the cached
     * projection is returned untouched until the ledger version or the locale
     * revision moves, which is what useSyncExternalStore requires.
     */
    function makeSlotRowsSource(ctx, slotName) {
      var rowsVersion = -1;
      var rowsRevision = -1;
      var rows = [];
      return {
        getSnapshot: function () {
          var version = ctx.slots.getVersion(slotName);
          var revision = ctx.locale.getSnapshot().revision;
          if (version !== rowsVersion || revision !== rowsRevision) {
            rowsVersion = version;
            rowsRevision = revision;
            rows = ctx.slots
              .entries(slotName)
              .map(function (e) {
                var lbl = "";
                try {
                  if (typeof e.options.label === "function") lbl = e.options.label();
                  else if (typeof e.options.label === "string") lbl = e.options.label;
                  else if (resolveSlotLabel) lbl = resolveSlotLabel(e.options.label);
                } catch (err) {
                  lbl = e.options.id || "";
                }
                return {
                  id: e.options.id !== undefined ? e.options.id : "",
                  order: e.options.order !== undefined ? e.options.order : 0,
                  label: lbl || e.options.id || "",
                };
              })
              .sort(function (a, b) {
                return a.order - b.order;
              });
          }
          return rows;
        },
        subscribe: function (listener) {
          var offLedger = ctx.slots.subscribe(slotName, listener);
          var offLocale = ctx.locale.subscribe(listener);
          return function () {
            offLedger();
            offLocale();
          };
        },
      };
    }

    /**
     * Sets up a shell with injected styles and event handlers for hover effects.
     *
     * On mouse enter, the text color changes to the primary label color.
     * On mouse leave, the text color reverts to the tertiary label color.
     *
     * No return value.
     */
    function makeShellInjected(ctx) {
      var sections = makeSlotRowsSource(ctx, "settings.section");
      var onboardingVersion = -1;
      var onboardingSteps = [];
      return function () {
        return {
          hooks: {
            sections: sections,
            onboardingSteps: {
              getSnapshot: function () {
                var version = ctx.slots.getVersion("settings.onboarding");
                if (version !== onboardingVersion) {
                  onboardingVersion = version;
                  onboardingSteps = ctx.slots
                    .entries("settings.onboarding")
                    .map(function (e) {
                      return {
                        id: e.options.id !== undefined ? e.options.id : "",
                        order: e.options.order !== undefined ? e.options.order : 0,
                      };
                    })
                    .sort(function (a, b) {
                      return a.order - b.order;
                    });
                }
                return onboardingSteps;
              },
              subscribe: function (listener) {
                return ctx.slots.subscribe("settings.onboarding", listener);
              },
            },
          },
        };
      };
    }

    /**
     * Adjusts the layout of navigation rows based on the presence and visibility of different groups.
     *
     * Returns: JSX elements representing the navigation layout.
     *
     * Fails if any required group rows are missing or if the `collapsedGroups` state is inconsistent.
     */
    function apply(ctx) {
      ctx.effect(function () {
        ctx.locale.register("sidebar", { zh: SIDEBAR_ZH, en: SIDEBAR_EN });
      }, "tweaks: sidebar dictionaries");
      ctx.effect(function () {
        ctx.locale.register("settings", { zh: SETTINGS_ZH, en: SETTINGS_EN });
      }, "tweaks: settings dictionaries");

      var tSettings = ctx.locale.bind("settings");
      var connection = ctx.get("connection");
      var documentController =
        connection && connection.api ? new SettingsDocumentStore(connection.api) : undefined;
      var documentInjected =
        documentController === undefined
          ? undefined
          : (function () {
              var useSnapshot = bindSnapshotSelector(documentController.observable);
              return function () {
                return { controller: documentController, useSnapshot: useSnapshot };
              };
            })();
      ctx.effect(function () {
        ctx.on("connection/reset", function () {
          refreshDocumentIfLoaded(documentController);
        });
      }, "tweaks: metadata invalidations");

      /**
       * Opens a session with the provided options and renders actions and options.
       *
       * Guarantees that the session is initialized and the close button is clickable.
       * Returns null if the renderSlot function is not provided.
       * Fails if `onClose` or `onSectionOpen` are not defined or not functions.
       */
      var startSession = function (workspaceId) {
        ctx.workspaces.startSession(workspaceId);
      };
      ctx.slots.inject(
        "sidebar.settings",
        function () {
          return ctx.slots.register(
            {
              name: "sidebar.settings",
              priority: -10,
              children: {
                "settings.trigger": { kind: "single", scope: "root" },
                "settings.header": { kind: "single", scope: "root" },
                "settings.action": { kind: "list", scope: "root" },
                "settings.close": { kind: "single", scope: "root" },
                "settings.section": { kind: "list", scope: "root" },
                "settings.onboarding": { kind: "list", scope: "root" },
                "settings.section.icon": { kind: "list", scope: "root" },
              },
              inject: makeShellInjected(ctx),
            },
            TweaksSettingsRoot,
          );
        },
        "tweaks: settings shell",
      );

      ctx.slots.inject(
        "settings.trigger",
        function () {
          return ctx.slots.register(
            { name: "settings.trigger", locale: "settings" },
            TriggerContent,
          );
        },
        "tweaks: trigger content",
      );
      ctx.slots.inject(
        "settings.header",
        function () {
          return ctx.slots.register({ name: "settings.header", locale: "settings" }, HeaderContent);
        },
        "tweaks: header content",
      );
      ctx.slots.inject(
        "settings.close",
        function () {
          return ctx.slots.register({ name: "settings.close", locale: "settings" }, CloseLabel);
        },
        "tweaks: close label",
      );
      if (documentInjected !== undefined) {
        ctx.slots.inject(
          "settings.action",
          function () {
            return ctx.slots.register(
              {
                name: "settings.action",
                id: "open-document",
                order: 0,
                locale: "settings",
                inject: documentInjected,
              },
              SettingsDocumentAction,
            );
          },
          "tweaks: open-document action",
        );
      }
      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "general",
              priority: -10,
              order: 0,
              label: function () {
                return tSettings("general.nav");
              },
              locale: "settings",
              children: { "settings.general.item": { kind: "list", scope: "root" } },
            },
            GeneralSection,
          );
        },
        "tweaks: general section",
      );

      // Appearance is a composition point, not a page: skins, icons and themes
      // stay implemented by the packages that own them and register into the
      // `settings.appearance.tab` seat declared here, the same way sections
      // themselves register into the seat the shell declares.
      var appearanceTabs = makeSlotRowsSource(ctx, "settings.appearance.tab");
      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "appearance",
              priority: -10,
              order: 5,
              label: function () {
                return "Appearance";
              },
              children: { "settings.appearance.tab": { kind: "list", scope: "root" } },
              inject: function () {
                return { hooks: { appearanceTabs: appearanceTabs } };
              },
            },
            AppearanceSettingsSection,
          );
        },
        "tweaks: appearance section",
      );

      ctx.slots.inject(
        "settings.appearance.tab",
        function () {
          return ctx.slots.register(
            {
              name: "settings.appearance.tab",
              id: "theme-studio",
              priority: -10,
              order: 0,
              label: function () {
                return "Theme Studio";
              },
            },
            ThemeStudioTab,
          );
        },
        "tweaks: appearance theme-studio tab",
      );

      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "keybinds",
              priority: -10,
              order: 35,
              label: function () {
                return "Keybinds";
              },
              inject: function () {
                return {};
              },
            },
            KeybindsSettingsSection,
          );
        },
        "tweaks: keybinds section",
      );

      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "skills-hooks",
              priority: -10,
              order: 25,
              label: function () {
                return "Skills & Hooks";
              },
              inject: function () {
                return {};
              },
            },
            SkillsHooksSettingsSection,
          );
        },
        "tweaks: skills and hooks section",
      );

      ctx.slots.inject(
        "settings.section",
        function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "plugins",
              priority: -10,
              order: 30,
              label: function () {
                return "Plugins";
              },
              inject: function () {
                return {};
              },
            },
            PluginsSettingsSection,
          );
        },
        "tweaks: plugins section",
      );

      // Harness-owned sections cannot register a glyph from their own bundles
      // (the harness checkout is kept pristine), so tweaks owns the three
      // mark seats — models, plugins, agent-presets — under the shared
      // settings.section.icon seat keyed by section id.
      /**
       * Sets the active section and opens the settings panel.
       *
       * Guarantees that the active section is set to the provided section if it exists.
       * Returns a cleanup function to remove the event listener.
       * Fails silently if the event detail section is not provided.
       */
      function GeneralGlyph() {
        return navIcon("general");
      }
      /**
       * The Appearance section's nav glyph: the palette mark that stands for
       * every appearance page — theme studio, skins, icons and themes — now
       * that they share one nav row.
       *
       * @returns {JSX.Element} the palette icon sized for a nav cell.
       */
      function AppearanceGlyph() {
        return h(PaletteIcon, { className: "dsh-tw-navIcon", size: 16 });
      }
      /** The Skills & Hooks section's mark: the wrench the tooling nav uses. */
      function SkillsHooksGlyph() {
        return h(ToolsNavIcon, { className: "dsh-tw-navIcon", size: 16 });
      }
      /**
       * Sets the rows for the sections based on the provided props or defaults to a predefined list of sections.
       *
       * Guarantees that the returned `rawRows` will be an array of section objects or the default sections if `props.sections` is not provided or empty.
       *
       * On failure (if `props` is undefined or `props.sections` is not an array), returns the default list of sections.
       */
      function ModelsGlyph() {
        return navIcon("models");
      }
      /**
       * Sets up the initial configuration for the plugin sections.
       *
       * Ensures that `rawRows` is an array of section objects or defaults to a predefined set of sections.
       *
       * @param {Object} props - The configuration object that may contain `sections`.
       * @returns {Array} The `rawRows` array of section objects.
       */
      function PluginsGlyph() {
        return navIcon("plugins");
      }
      /**
       * Sets up the initial list of agent presets rows, ensuring no suppressed sections are included.
       *
       * Guarantees a default set of rows if `rawRows` is empty or undefined, excluding suppressed sections.
       *
       * @returns {Array} An array of preset rows, each with an `id`, `label`, and `order`.
       */
      function AgentPresetsGlyph() {
        return navIcon("agent-presets");
      }
      /**
       * Iterates over a list of sections to filter out suppressed sections and collect unique, visible rows.
       *
       * Guarantees: Returns an array of rows that are not suppressed and have unique IDs.
       *
       * On failure: Ignores suppressed sections and duplicates, ensuring only visible, unique rows are included.
       */
      function KeybindsGlyph() {
        return navIcon("keybinds");
      }
      /**
       * Filters the rawRows array to exclude suppressed sections and duplicates.
       *
       * Guarantees that only unique, non-suppressed rows are included in the result.
       *
       * @returns {Array} An array of objects representing rows, excluding suppressed sections and duplicates.
       */
      function harnessGlyph(id, component) {
        return function () {
          return ctx.slots.register(
            {
              name: "settings.section.icon",
              id: id,
              priority: -10,
              order: 0,
            },
            component,
          );
        };
      }
      ctx.slots.inject(
        "settings.section.icon",
        harnessGlyph("general", GeneralGlyph),
        "tweaks: general nav glyph",
      );
      ctx.slots.inject(
        "settings.section.icon",
        harnessGlyph("appearance", AppearanceGlyph),
        "tweaks: appearance nav glyph",
      );
      ctx.slots.inject(
        "settings.section.icon",
        harnessGlyph("skills-hooks", SkillsHooksGlyph),
        "tweaks: skills and hooks nav glyph",
      );
      ctx.slots.inject(
        "settings.section.icon",
        harnessGlyph("keybinds", KeybindsGlyph),
        "tweaks: keybinds nav glyph",
      );
      ctx.slots.inject(
        "settings.section.icon",
        harnessGlyph("plugins", PluginsGlyph),
        "tweaks: plugins nav glyph",
      );
      ctx.slots.inject(
        "settings.section.icon",
        harnessGlyph("agent-presets", AgentPresetsGlyph),
        "tweaks: agent presets nav glyph",
      );

      // Shadows client-ui-settings-models' "welcome-notice" settings.onboarding
      // entry (same id, same order, lower priority wins the cell) so the
      // Settings "Internal Testing Notice" toggle actually controls it. See
      // TweaksWelcomeNoticeOverride.
      ctx.slots.inject(
        "settings.onboarding",
        function () {
          return ctx.slots.register(
            {
              name: "settings.onboarding",
              id: "welcome-notice",
              priority: -10,
              order: -100,
            },
            TweaksWelcomeNoticeOverride,
          );
        },
        "tweaks: welcome notice override",
      );

      // 1. Session header utilities: 3-dots with View Switcher and Download Log
      /**
       * Ensures that the session is in the "ready" phase and either has no current pane or the current pane is blank.
       * Sets the `completedOnboarding` state to a new Set if onboarding is not active.
       * Fails silently if the session is not in the "ready" phase or if the current pane is not blank.
       */
      function SessionHeaderUtilities(props) {
        var sessionId = props.sessionId;
        var menuState = React.useState(false);
        var menuOpen = menuState[0],
          setMenuOpen = menuState[1];
        var busyState = React.useState(false);
        var busy = busyState[0],
          setBusy = busyState[1];
        var trajState = React.useState(false);
        var isTrajectory = trajState[0],
          setIsTrajectory = trajState[1];

        /**
         * Ensures that the onboarding step is marked as completed.
         *
         * Guarantees that the onboarding step ID is added to the set of completed steps.
         * Returns the updated set of completed steps.
         * Fails if the step ID is already marked as completed.
         */
        var checkIsTrajectory = function () {
          var activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
          if (activeTab) {
            var txt = (activeTab.textContent || "").trim().toLowerCase();
            return (
              txt === "trajectory" ||
              txt.includes("trajectory") ||
              txt === "轨迹" ||
              txt.includes("轨迹")
            );
          }
          return Boolean(
            document.querySelector(
              '[class*="TrajectoryView"], [class*="trajectoryView"], [aria-label*="Trajectory"]',
            ),
          );
        };

        React.useEffect(function () {
          /**
           * Opens the settings menu when clicked.
           *
           * This function sets the `open` state to true, preventing default event behavior and stopping propagation.
           *
           * @returns {void}
           */
          var update = function () {
            setIsTrajectory(checkIsTrajectory());
          };
          update();
          var timer = setInterval(update, 400);
          return function () {
            clearInterval(timer);
          };
        }, []);

        /**
         * Toggles the view mode, showing a tooltip with a settings trigger when not open,
         * and opening the settings dialog when triggered.
         *
         * On failure, the function returns the original view without any changes.
         */
        var handleToggleView = function () {
          setMenuOpen(false);
          var onTrajectoryNow = checkIsTrajectory();
          var targetName = onTrajectoryNow ? "chat" : "trajectory";

          var allTabs = Array.from(
            document.querySelectorAll('[role="tab"], [role="tablist"] button'),
          );
          var targetBtn = allTabs.find(function (b) {
            var t = (b.textContent || "").trim().toLowerCase();
            return (
              (targetName === "chat" &&
                (t === "chat" || t.includes("chat") || t === "对话" || t.includes("对话"))) ||
              (targetName === "trajectory" &&
                (t === "trajectory" ||
                  t.includes("trajectory") ||
                  t === "轨迹" ||
                  t.includes("轨迹")))
            );
          });

          if (targetBtn) {
            targetBtn.click();
          } else {
            var inactiveBtn = allTabs.find(function (b) {
              return b.getAttribute("aria-selected") !== "true";
            });
            if (inactiveBtn) inactiveBtn.click();
          }

          setTimeout(function () {
            setIsTrajectory(checkIsTrajectory());
          }, 80);
        };

        /**
         * Displays a SettingsPanel overlay with a mask and error boundary.
         * Ensures the document is defined and ReactDOM.createPortal is available.
         * Returns the rendered SettingsPanel component.
         * Fallback to rendering the SettingsPanel directly if portals are not supported.
         */
        var handleDownloadLog = function () {
          setMenuOpen(false);
          setBusy(true);
          try {
            var exportUrl = "/api/session.export?id=" + encodeURIComponent(sessionId || "");
            var a = document.createElement("a");
            a.href = exportUrl;
            a.download = (sessionId || "session") + ".jsonl";
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
              if (a.parentNode) a.parentNode.removeChild(a);
              setBusy(false);
            }, 1000);
          } catch (e) {
            setBusy(false);
          }
        };

        var items = [
          {
            id: "toggle-view",
            label: isTrajectory ? "Switch to Chat View" : "Switch to Trajectory View",
            icon: h(isTrajectory ? ChatGlyph : BranchIcon, { size: 14 }),
          },
          {
            id: "download-log",
            label: busy ? "Exporting log…" : "Download Session Log",
            icon: h(DownloadIcon, { size: 14 }),
            disabled: busy,
          },
        ];

        return h(
          "div",
          { style: { position: "relative", display: "inline-flex", alignItems: "center" } },
          h(
            "button",
            {
              type: "button",
              className: "dsh-header-ellipsis-btn",
              title: "Session Options (…)",
              "aria-label": "Session Options",
              style: {
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                border: "none",
                background: menuOpen
                  ? "var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.08))"
                  : "transparent",
                color: "var(--dsw-alias-label-secondary)",
                cursor: "pointer",
                transition: "background 100ms, color 100ms",
              },
              onClick: function (e) {
                e.stopPropagation();
                setIsTrajectory(checkIsTrajectory());
                setMenuOpen(!menuOpen);
              },
            },
            h(EllipsisIcon, { size: 16 }),
          ),
          menuOpen
            ? h(SelectDropdownMenu, {
                open: true,
                align: "right",
                onClose: function () {
                  setMenuOpen(false);
                },
                items: items,
                onSelect: function (id) {
                  if (id === "toggle-view") handleToggleView();
                  else if (id === "download-log") handleDownloadLog();
                },
              })
            : null,
        );
      }

      ctx.slots.inject(
        "conversation.session.header.utilities",
        function () {
          return ctx.slots.register(
            {
              name: "conversation.session.header.utilities",
              id: "dsh-session-utilities",
              priority: -10,
              order: 0,
            },
            SessionHeaderUtilities,
          );
        },
        "tweaks: 3-dots session header utilities",
      );

      // 2. Subagents Dock above input bar
      /** SubagentsDock implementation. */
      function SubagentsDock(props) {
        var sessionId = props.sessionId;
        var useSessions = props.useSessions;
        var openChild = props.openChild;
        var sessionsState =
          typeof useSessions === "function"
            ? useSessions(function (s) {
                return s;
              })
            : null;
        var subagentsMap =
          sessionsState && sessionsState.subagentsByParent ? sessionsState.subagentsByParent : {};
        var rawSubagents =
          sessionId && subagentsMap[sessionId] ? subagentsMap[sessionId].entries || [] : [];
        var summaries = sessionsState && sessionsState.summaries ? sessionsState.summaries : {};

        var collapsedState = React.useState(true);
        var collapsed = collapsedState[0],
          setCollapsed = collapsedState[1];

        if (!rawSubagents || rawSubagents.length === 0) return null;

        var runningCount = 0;
        var completedCount = 0;
        var childList = rawSubagents.map(function (entry) {
          var cId = entry.childSessionId || entry.id;
          var summary = summaries[cId] || {};
          var title =
            summary.displayTitle ||
            summary.title ||
            entry.name ||
            entry.role ||
            "Subagent " + (cId ? cId.slice(0, 6) : "");
          var role = (
            entry.role ||
            entry.mode ||
            summary.role ||
            summary.mode ||
            "subagent"
          ).toLowerCase();
          var isRunning = entry.activity === "running" || summary.status === "running";
          var tokens = summary.usage
            ? summary.usage.totalTokens || summary.usage.outputTokens
            : null;
          var tokenStr = tokens
            ? tokens > 1000
              ? (tokens / 1000).toFixed(1) + "k tokens"
              : tokens + " tokens"
            : "";

          if (isRunning) runningCount++;
          else completedCount++;
          return {
            id: cId,
            title: title,
            role: role,
            isRunning: isRunning,
            tokenStr: tokenStr,
            address: entry.address || { parentSessionId: sessionId, childSessionId: cId },
          };
        });

        var progressParts = [];
        if (runningCount > 0) progressParts.push(runningCount + " active");
        if (completedCount > 0) progressParts.push(completedCount + " completed");
        var progressStr = progressParts.join(" · ") || childList.length + " subagents";

        /**
         * Sets the badge style for a role based on the provided settings.
         *
         * Guarantees that the role badge style is returned according to the settings.
         * Returns null if no settings are provided.
         * Fails if the settings are not valid or do not contain the necessary role information.
         */
        var getRoleBadgeStyle = function (role) {
          if (role.indexOf("plan") !== -1 || role.indexOf("reason") !== -1) {
            return { bg: "rgba(99, 102, 241, 0.15)", color: "#818cf8" };
          } else if (role.indexOf("exec") !== -1) {
            return { bg: "rgba(99, 102, 241, 0.15)", color: "#6366f1" };
          } else if (role.indexOf("research") !== -1) {
            return { bg: "rgba(128, 128, 128, 0.15)", color: "var(--dsw-alias-label-secondary)" };
          } else if (role.indexOf("orch") !== -1) {
            return { bg: "rgba(99, 102, 241, 0.15)", color: "#6366f1" };
          }
          return { bg: "rgba(128, 128, 128, 0.15)", color: "var(--dsw-alias-label-secondary)" };
        };

        return h(
          "section",
          {
            className: "dsh-subagents-dock",
            style: {
              boxSizing: "border-box",
              flex: "none",
              overflow: "hidden",
              margin: "0 auto 6px auto",
              width: "100%",
              maxWidth: "776px",
              border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.15))",
              borderRadius: "12px",
              background: "var(--dsw-specific-tip, rgba(30,30,30,0.85))",
            },
          },
          h(
            "div",
            {
              className: "dsh-subagents-dock-header",
              style: {
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                height: "36px",
                padding: "4px 5px 4px 12px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                userSelect: "none",
                boxSizing: "border-box",
              },
              onClick: function () {
                setCollapsed(!collapsed);
              },
            },
            h(GoalIcon, { size: 14, style: { color: "var(--dsw-alias-label-secondary)" } }),
            h(
              "span",
              {
                style: {
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--dsw-alias-label-primary)",
                },
              },
              "Subagents",
            ),
            h(
              "span",
              {
                style: {
                  fontSize: "12px",
                  color: "var(--dsw-alias-label-secondary)",
                  marginLeft: "4px",
                },
              },
              progressStr,
            ),
            h(
              "span",
              {
                style: {
                  marginLeft: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "16px",
                  height: "16px",
                  transition: "transform 150ms ease",
                  transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
                  color: "var(--dsw-alias-label-tertiary)",
                },
              },
              h(TriangleRightFill14, { size: 10 }),
            ),
          ),
          !collapsed
            ? h(
                "div",
                {
                  className: "dsh-subagents-dock-body",
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    padding: "4px 12px 10px 12px",
                    borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.1))",
                  },
                },
                childList.map(function (sub) {
                  var badge = getRoleBadgeStyle(sub.role);
                  return h(
                    "div",
                    {
                      key: sub.id,
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "5px 8px",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "12.5px",
                        color: "var(--dsw-alias-label-primary)",
                        transition: "background 100ms",
                      },
                      className: "dsh-subagent-dock-row",
                      onClick: function (e) {
                        e.stopPropagation();
                        if (openChild) openChild(sub.address);
                        else
                          window.dispatchEvent(
                            new CustomEvent("dsh:open-session", { detail: { sessionId: sub.id } }),
                          );
                      },
                    },
                    h("span", {
                      style: {
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        backgroundColor: sub.isRunning
                          ? "#6366f1"
                          : "var(--dsw-alias-label-tertiary, #888)",
                        boxShadow: sub.isRunning ? "0 0 6px rgba(99,102,241,0.6)" : "none",
                        flexShrink: 0,
                      },
                    }),
                    h(
                      "span",
                      {
                        style: {
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontSize: "10.5px",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          background: badge.bg,
                          color: badge.color,
                          flexShrink: 0,
                        },
                      },
                      sub.role,
                    ),
                    h(
                      "span",
                      {
                        style: {
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        },
                      },
                      sub.title,
                    ),
                    sub.tokenStr
                      ? h(
                          "span",
                          {
                            style: {
                              fontSize: "11px",
                              color: "var(--dsw-alias-label-tertiary)",
                              flexShrink: 0,
                            },
                          },
                          sub.tokenStr,
                        )
                      : null,
                    h(
                      "span",
                      {
                        style: {
                          fontSize: "11px",
                          color: sub.isRunning ? "#6366f1" : "var(--dsw-alias-label-tertiary)",
                          flexShrink: 0,
                        },
                      },
                      sub.isRunning ? "running" : "done",
                    ),
                  );
                }),
              )
            : null,
        );
      }

      ctx.slots.inject(
        "conversation.input.dock",
        function () {
          return ctx.slots.register(
            {
              name: "conversation.input.dock",
              id: "dsh-subagents-dock",
              order: 5,
              inject: function () {
                return {
                  openChild: function (address) {
                    if (ctx.sessions && typeof ctx.sessions.openSubagent === "function") {
                      ctx.sessions.openSubagent(address);
                    } else if (address && address.childSessionId) {
                      window.dispatchEvent(
                        new CustomEvent("dsh:open-session", {
                          detail: { sessionId: address.childSessionId },
                        }),
                      );
                    }
                  },
                };
              },
            },
            SubagentsDock,
          );
        },
        "tweaks: subagents dock above input bar",
      );

      // 3. Shadow header subagent catalog and agent-preset
      ctx.slots.inject(
        "conversation.session.header.actions",
        function () {
          return ctx.slots.register(
            {
              name: "conversation.session.header.actions",
              id: "subagent-catalog",
              priority: -20,
              order: 10,
            },
            function () {
              return null;
            },
          );
        },
        "tweaks: hide header subagent catalog",
      );

      ctx.slots.inject(
        "conversation.session.header.actions",
        function () {
          return ctx.slots.register(
            {
              name: "conversation.session.header.actions",
              id: "agent-preset",
              priority: -20,
              order: -10,
            },
            function () {
              return null;
            },
          );
        },
        "tweaks: hide header agent-preset",
      );

      // APP-WIDE CUSTOM RIGHT-CLICK CONTEXT MENU ABSTRACTION
      if (typeof document !== "undefined") {
        var oldContainer = document.getElementById("dsh-global-context-menu");
        if (oldContainer && oldContainer.parentNode) {
          oldContainer.parentNode.removeChild(oldContainer);
        }
        if (window.__dsh_cleanup_context_menu__) {
          try {
            window.__dsh_cleanup_context_menu__();
          } catch (e) {}
        }

        var menuContainer = document.createElement("div");
        menuContainer.id = "dsh-global-context-menu";
        menuContainer.style.position = "fixed";
        menuContainer.style.zIndex = "9999999";
        menuContainer.style.display = "none";
        document.body.appendChild(menuContainer);

        /**
         * Closes the menu by removing all injected navigation glyphs.
         *
         * This function guarantees that the menu will be closed, and all navigation
         * glyphs will be removed from the slots.
         */
        var closeMenu = function () {
          menuContainer.style.display = "none";
          menuContainer.innerHTML = "";
        };

        /**
         * Ensures the session is in the "ready" phase and either has no current pane or the current pane is blank.
         * Sets the `completedOnboarding` state to a new Set if onboarding is not active.
         * Fails silently if the session is not in the "ready" phase or if the current pane is not blank.
         */
        var onKeyDown = function (e) {
          if (e.key === "Escape") closeMenu();
        };
        /**
         * Displays context menu options for session management.
         * Ensures the session is in the "ready" phase and the current pane is blank.
         * Sets up context menu slots for keybinds, plugins, and agent presets.
         * Fails silently if the session is not in the "ready" phase or the current pane is not blank.
         */
        var onContextMenu = function (e) {
          e.preventDefault();
          e.stopPropagation();

          var icons = {
            chat: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
            terminal:
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
            container:
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
            cut: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
            copy: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
            paste:
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
            rename:
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
            close:
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
            appearance:
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 10 10 0 0 0 0-20"/></svg>',
            settings:
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
            reload:
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
          };

          var x = e.clientX;
          var y = e.clientY;
          var selectedText = window.getSelection ? window.getSelection().toString() : "";
          var targetEl = e.target;
          var isEditable =
            targetEl &&
            (targetEl.tagName === "INPUT" ||
              targetEl.tagName === "TEXTAREA" ||
              targetEl.isContentEditable);
          var sessionEl = targetEl
            ? targetEl.closest('[data-session-id], [class*="historyRow"], [class*="chatTab"]')
            : null;
          var workspaceEl = targetEl
            ? targetEl.closest('[data-workspace-id], [class*="workspaceRow"]')
            : null;
          var targetSessionId = sessionEl
            ? sessionEl.getAttribute("data-session-id") || sessionEl.getAttribute("data-id")
            : null;
          var targetWorkspaceId = workspaceEl
            ? workspaceEl.getAttribute("data-workspace-id") || workspaceEl.getAttribute("data-id")
            : null;

          var items = [];

          // 1. Contextual Items (Rename / Close / Delete)
          if (sessionEl) {
            items.push({
              id: "rename-session",
              label: "Rename Conversation",
              icon: icons.rename,
              action: function () {
                window.dispatchEvent(
                  new CustomEvent("dsh:rename-session", { detail: { id: targetSessionId } }),
                );
              },
            });
            items.push({
              id: "close-session",
              label: "Close / Archive Session",
              icon: icons.close,
              action: function () {
                window.dispatchEvent(
                  new CustomEvent("dsh:close-session", { detail: { id: targetSessionId } }),
                );
              },
            });
            items.push({ type: "divider" });
          } else if (workspaceEl) {
            items.push({
              id: "rename-workspace",
              label: "Rename Workspace",
              icon: icons.rename,
              action: function () {
                window.dispatchEvent(
                  new CustomEvent("dsh:rename-workspace", { detail: { id: targetWorkspaceId } }),
                );
              },
            });
            items.push({
              id: "close-workspace",
              label: "Close Workspace",
              icon: icons.close,
              action: function () {
                window.dispatchEvent(
                  new CustomEvent("dsh:delete-workspace", { detail: { id: targetWorkspaceId } }),
                );
              },
            });
            items.push({ type: "divider" });
          }

          // 2. Clipboard actions
          if (selectedText) {
            if (isEditable) {
              items.push({
                id: "cut",
                label: "Cut",
                icon: icons.cut,
                action: function () {
                  navigator.clipboard.writeText(selectedText).then(function () {
                    try {
                      document.execCommand("delete");
                    } catch (err) {}
                  });
                },
              });
            }
            items.push({
              id: "copy",
              label:
                'Copy ("' +
                (selectedText.length > 20 ? selectedText.slice(0, 18) + "…" : selectedText) +
                '")',
              icon: icons.copy,
              action: function () {
                navigator.clipboard.writeText(selectedText);
              },
            });
          }

          items.push({
            id: "paste",
            label: "Paste",
            icon: icons.paste,
            action: function () {
              navigator.clipboard.readText().then(function (text) {
                if (!text) return;
                try {
                  if (
                    document.activeElement &&
                    (document.activeElement.tagName === "INPUT" ||
                      document.activeElement.tagName === "TEXTAREA" ||
                      document.activeElement.isContentEditable)
                  ) {
                    document.execCommand("insertText", false, text);
                  } else {
                    var activeInput = document.querySelector("textarea, input:focus");
                    if (activeInput) {
                      activeInput.value = (activeInput.value || "") + text;
                      activeInput.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                  }
                } catch (err) {}
              });
            },
          });

          items.push({ type: "divider" });

          // 3. Main actions
          items.push({
            id: "chat",
            label: "New Conversation",
            icon: icons.chat,
            action: function () {
              startSession();
            },
          });
          items.push({
            id: "terminal",
            label: "New Terminal",
            icon: icons.terminal,
            action: function () {
              window.dispatchEvent(
                new CustomEvent("dsh:open-terminal", { detail: { session: "0" } }),
              );
            },
          });
          items.push({
            id: "container",
            label: "New Container",
            icon: icons.container,
            action: function () {
              window.dispatchEvent(new CustomEvent("dsh:open-container", { detail: { id: null } }));
            },
          });
          items.push({ type: "divider" });

          items.push({
            id: "appearance",
            label: "Appearance & Themes",
            icon: icons.appearance,
            action: function () {
              window.dispatchEvent(
                new CustomEvent("dsh:open-settings", { detail: { section: "appearance" } }),
              );
            },
          });
          items.push({
            id: "settings",
            label: "Settings & Preferences",
            icon: icons.settings,
            action: function () {
              window.dispatchEvent(
                new CustomEvent("dsh:open-settings", { detail: { section: "general" } }),
              );
            },
          });
          items.push({ type: "divider" });
          items.push({
            id: "reload",
            label: "Reload Window",
            icon: icons.reload,
            action: function () {
              window.location.reload();
            },
          });

          menuContainer.innerHTML = "";
          var menuEl = document.createElement("div");
          menuEl.style.minWidth = "220px";
          menuEl.style.background = "var(--dsw-alias-surface-l0, #181825)";
          menuEl.style.border = "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))";
          menuEl.style.borderRadius = "10px";
          menuEl.style.boxShadow = "0 12px 36px rgba(0,0,0,0.6)";
          menuEl.style.padding = "5px";
          menuEl.style.display = "flex";
          menuEl.style.flexDirection = "column";
          menuEl.style.gap = "2px";
          menuEl.style.fontFamily = "inherit";

          items.forEach(function (item) {
            if (item.type === "divider") {
              var div = document.createElement("div");
              div.style.height = "1px";
              div.style.background = "var(--dsw-alias-border-l1, rgba(128,128,128,0.15))";
              div.style.margin = "4px 0";
              menuEl.appendChild(div);
              return;
            }
            var btn = document.createElement("button");
            btn.type = "button";
            btn.style.display = "flex";
            btn.style.alignItems = "center";
            btn.style.gap = "10px";
            btn.style.width = "100%";
            btn.style.padding = "8px 12px";
            btn.style.borderRadius = "6px";
            btn.style.border = "none";
            btn.style.background = "transparent";
            btn.style.color = "var(--dsw-alias-label-primary, #fff)";
            btn.style.fontSize = "13px";
            btn.style.textAlign = "left";
            btn.style.cursor = "pointer";
            btn.style.fontFamily = "inherit";

            btn.onmouseenter = function () {
              btn.style.background =
                "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.15))";
            };
            btn.onmouseleave = function () {
              btn.style.background = "transparent";
            };
            btn.onclick = function (ev) {
              ev.stopPropagation();
              closeMenu();
              item.action();
            };

            var iconSpan = document.createElement("span");
            iconSpan.style.width = "16px";
            iconSpan.style.height = "16px";
            iconSpan.style.display = "inline-flex";
            iconSpan.style.alignItems = "center";
            iconSpan.style.justifyContent = "center";
            iconSpan.style.color = "var(--dsw-alias-label-secondary, #a8a8a8)";
            iconSpan.innerHTML = item.icon;

            var textSpan = document.createElement("span");
            textSpan.style.flex = "1";
            textSpan.textContent = item.label;

            btn.appendChild(iconSpan);
            btn.appendChild(textSpan);
            menuEl.appendChild(btn);
          });

          menuContainer.appendChild(menuEl);
          menuContainer.style.display = "block";

          var menuWidth = 220;
          var menuHeight = 240;
          var finalX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
          var finalY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

          menuContainer.style.left = Math.max(8, finalX) + "px";
          menuContainer.style.top = Math.max(8, finalY) + "px";
        };

        document.addEventListener("click", closeMenu);
        document.addEventListener("scroll", closeMenu, true);
        window.addEventListener("keydown", onKeyDown);
        document.addEventListener("contextmenu", onContextMenu, true);

        window.__dsh_cleanup_context_menu__ = function () {
          document.removeEventListener("click", closeMenu);
          document.removeEventListener("scroll", closeMenu, true);
          window.removeEventListener("keydown", onKeyDown);
          document.removeEventListener("contextmenu", onContextMenu, true);
        };
      }

      // Initialize saved custom theme / palette
      (function initCustomTheme() {
        if (
          typeof window === "undefined" ||
          !window.localStorage ||
          typeof document === "undefined"
        )
          return;
        var savedPalette = window.localStorage.getItem("dsh_custom_palette");
        var activeTheme = window.localStorage.getItem("dsh_active_theme");
        if (savedPalette) {
          try {
            var palette = JSON.parse(savedPalette);
            applyCustomThemePaletteVars(palette, activeTheme);
          } catch (e) {}
        }
      })();

      (function initMainSidebarLocation() {
        if (typeof window === "undefined" || !window.localStorage) return;
        try {
          var saved = window.localStorage.getItem("dsh_main_sidebar_location");
          var legacy = window.localStorage.getItem("dsh_swap_sidebars");
          var location = saved;
          if (location !== "left" && location !== "right") {
            location = legacy === "true" ? "right" : "left";
            window.localStorage.setItem("dsh_main_sidebar_location", location);
          }
          if (legacy !== null) {
            try {
              window.localStorage.removeItem("dsh_swap_sidebars");
            } catch (err) {}
          }
          if (location === "right") {
            if (document.body) document.body.classList.add("dsh-main-sidebar-right");
            else
              document.addEventListener("DOMContentLoaded", function () {
                document.body.classList.add("dsh-main-sidebar-right");
              });
          }
        } catch (e) {}
      })();

      (function initFullWidthConversation() {
        if (typeof window === "undefined" || !window.localStorage) return;
        try {
          if (window.localStorage.getItem("dsh_full_width_conversation") === "true") {
            if (document.body) document.body.classList.add("dsh-full-width-conversation");
            else
              document.addEventListener("DOMContentLoaded", function () {
                document.body.classList.add("dsh-full-width-conversation");
              });
          }
        } catch (e) {}
      })();

      /**
       * Mirrors the main sidebar's live width into `--dsh-main-sidebar-width`.
       *
       * The harness sizes its shell grid by writing `grid-template-columns`
       * inline on the frame element, with the main sidebar as the leading
       * track. Placing the sidebar on the right replaces that whole property,
       * so the replacement track cannot inherit the harness's sizing and has
       * to read it: this takes the first track out of the inline value the
       * harness still writes, and publishes it for both the replacement track
       * and every element that offsets against the sidebar. Reading the inline
       * declaration rather than the rendered element keeps the harness the one
       * owner of the width even while the override wins the cascade, and it is
       * what stops the sidebar from being sized by one number while its grid
       * track is sized by another — the disagreement that pushed it past the
       * viewport edge (#234).
       */
      function trackMainSidebarWidth() {
        if (typeof document === "undefined") return;
        var frame = document.querySelector('[class*="frame"]');
        if (!frame) return;
        var leadingTrack = (frame.style.gridTemplateColumns || "").trim().split(/\s+/)[0];
        if (!/^\d+(\.\d+)?px$/.test(leadingTrack)) return;
        document.documentElement.style.setProperty("--dsh-main-sidebar-width", leadingTrack);
      }

      if (typeof window !== "undefined" && typeof document !== "undefined") {
        trackMainSidebarWidth();
        var mainSidebarWidthObserver = new MutationObserver(trackMainSidebarWidth);
        mainSidebarWidthObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["style"],
          childList: true,
          subtree: true,
        });
      }

      (function initComposerLayout() {
        if (typeof window === "undefined" || !window.localStorage) return;
        try {
          var layout = window.localStorage.getItem("dsh_composer_toolbar_layout") || "unified";
          /**
           * Applies the persisted composer toolbar layout ("split" or
           * "unified") to the document body as a class, so the shell CSS
           * renders the correct layout from first paint instead of only
           * after the Settings panel's own toggle handler runs.
           * @returns {void} No return value; mutates document.body's class list.
           */
          var applyClass = function () {
            document.body.classList.remove("dsh-composer-split", "dsh-composer-unified");
            document.body.classList.add(
              layout === "split" ? "dsh-composer-split" : "dsh-composer-unified",
            );
          };
          if (document.body) applyClass();
          else document.addEventListener("DOMContentLoaded", applyClass);
        } catch (e) {}
      })();
      // Universal Lucide Animated Icons DOM Decorator
      /**
       * Sets the style for a badge based on the sub object's state.
       *
       * Returns a React element representing the badge with styled properties.
       * Fails if the sub object does not contain valid properties for styling.
       */
      function ensureUniversalLucideIcons() {
        if (typeof document === "undefined" || !document.body) return;
        var svgs = document.querySelectorAll("svg");
        for (var i = 0; i < svgs.length; i++) {
          var svg = svgs[i];
          var cls = svg.getAttribute("class") || "";
          if (cls.indexOf("badge") !== -1) continue;
          if (cls.indexOf("dsh-icon-animated") === -1) {
            svg.setAttribute("class", (cls + " dsh-icon-animated").trim());
          }

          var parentBtn = svg.closest(
            'button, a, [role="button"], [role="tab"], [role="menuitem"], .dsh-tree-projectRow, .dsh-tree-sessionRow',
          );
          var title = (
            svg.getAttribute("aria-label") ||
            svg.getAttribute("data-icon") ||
            (parentBtn
              ? parentBtn.getAttribute("title") ||
                parentBtn.getAttribute("aria-label") ||
                parentBtn.className
              : "")
          ).toLowerCase();

          if (cls.indexOf("dsh-icon-") === -1) {
            if (
              title.indexOf("setting") !== -1 ||
              title.indexOf("gear") !== -1 ||
              title.indexOf("config") !== -1 ||
              title.indexOf("pref") !== -1
            ) {
              svg.classList.add("dsh-icon-settings");
            } else if (
              title.indexOf("refresh") !== -1 ||
              title.indexOf("reload") !== -1 ||
              title.indexOf("sync") !== -1
            ) {
              svg.classList.add("dsh-icon-refresh");
            } else if (
              title.indexOf("trash") !== -1 ||
              title.indexOf("delete") !== -1 ||
              title.indexOf("remove") !== -1
            ) {
              svg.classList.add("dsh-icon-trash");
            } else if (
              title.indexOf("plus") !== -1 ||
              title.indexOf("add") !== -1 ||
              title.indexOf("new") !== -1 ||
              title.indexOf("create") !== -1
            ) {
              svg.classList.add("dsh-icon-plus");
            } else if (
              title.indexOf("edit") !== -1 ||
              title.indexOf("pencil") !== -1 ||
              title.indexOf("rename") !== -1
            ) {
              svg.classList.add("dsh-icon-edit");
            } else if (
              title.indexOf("terminal") !== -1 ||
              title.indexOf("console") !== -1 ||
              title.indexOf("bash") !== -1
            ) {
              svg.classList.add("dsh-icon-terminal");
            } else if (title.indexOf("search") !== -1 || title.indexOf("find") !== -1) {
              svg.classList.add("dsh-icon-search");
            } else if (title.indexOf("pin") !== -1) {
              svg.classList.add("dsh-icon-pin");
            } else if (
              title.indexOf("chat") !== -1 ||
              title.indexOf("message") !== -1 ||
              title.indexOf("conversation") !== -1
            ) {
              svg.classList.add("dsh-icon-chat");
            } else if (title.indexOf("folder") !== -1 || title.indexOf("dir") !== -1) {
              svg.classList.add("dsh-icon-folder");
            } else if (
              title.indexOf("container") !== -1 ||
              title.indexOf("box") !== -1 ||
              title.indexOf("docker") !== -1
            ) {
              svg.classList.add("dsh-icon-containers");
            }
          }
        }
      }

      if (typeof window !== "undefined" && typeof document !== "undefined") {
        setTimeout(ensureUniversalLucideIcons, 100);
        var iconObserver = new MutationObserver(function () {
          ensureUniversalLucideIcons();
        });
        iconObserver.observe(document.body, { childList: true, subtree: true });
      }
    }
    //#endregion
    exports.apply = apply;
    exports.inject = ["slots", "locale", "layout", "sessions", "workspaces", "connection"];
    return module.exports;
  },
});

// jscpd:ignore-end
