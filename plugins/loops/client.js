// agent-loops client scaffold
/** function implementation. */
export default function (ctx) {}

// Real activation-gating edge (cordis fiber inject, distinct from
// package.json's dsh.client.inject — see #91): this bundle needs the
// `slots` service ready before it activates.
export const inject = ["slots"];
