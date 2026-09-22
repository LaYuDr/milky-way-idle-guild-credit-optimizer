"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { tooltipContent, createRenderer, componentClass } = require("../src/runtime/profile-tooltips.js");
const element = (type, props) => ({ type, props });
const wrap = (type) => ({ WrappedComponent: { type } });
class Skill {
  constructor(props) {
    this.props = props;
  }
  render() {}
  renderTooltipContent() {
    return { kind: "skill", ...this.props };
  }
}
class Ability extends Skill {
  renderTooltip() {
    return { kind: "ability", ...this.props };
  }
}
class ItemTooltip extends Skill {
  renderTooltipContent() {
    return { kind: "item", ...this.props };
  }
}
class Item extends Skill {
  render() {
    return element("div", { children: element(wrap(ItemTooltip), this.props) });
  }
}
class Profile extends Skill {
  renderSkillsTab() {
    return element("div", {
      children: this.props.profile.characterSkills.map((record) => element(wrap(Skill), record))
    });
  }
  renderEquipmentTab() {
    const p = this.props.profile;
    p.equippedAbilities.sort((a, b) => a.slotNumber - b.slotNumber);
    return element("div", {
      children: [
        ...Object.values(p.wearableItemMap).map((r) => element(wrap(Item), r)),
        ...p.equippedAbilities.map((r) => element(wrap(Ability), r))
      ]
    });
  }
}
const profile = {
  characterSkills: [{ skillHrid: "/skills/milking", level: 83, experience: 2347754 }],
  wearableItemMap: { legs: { itemHrid: "/items/sorcerer_boots", enhancementLevel: 12, count: 1 } },
  equippedAbilities: [
    { abilityHrid: "/abilities/puncture", level: 65, experience: 414669, slotNumber: 5 },
    { abilityHrid: "/abilities/heal", level: 31, experience: 45, slotNumber: 1 }
  ]
};
const controller = {
  props: { t: (key) => key },
  state: { sharableProfile: { characterName: "Another player" } },
  renderSharableProfile() {
    return element(wrap(Profile), { profile: this.state.sharableProfile });
  }
};
test("native tooltip adapters use the selected profile's level, XP and enhancement without changing game state", () => {
  const before = JSON.stringify({ profile, state: controller.state });
  for (const [kind, record] of [
    ["skill", profile.characterSkills[0]],
    ["item", profile.wearableItemMap.legs],
    ["ability", profile.equippedAbilities[0]]
  ]) {
    const content = tooltipContent(controller, profile, kind, {
      ...record,
      itemClickedHandler: () => assert.fail("must not invoke actions")
    });
    assert.equal(content.kind, kind);
    for (const [key, value] of Object.entries(record)) assert.equal(content[key], value);
    assert.equal(content.itemClickedHandler, undefined);
  }
  assert.equal(JSON.stringify({ profile, state: controller.state }), before);
});
test("missing private APIs or unsupported tooltip records return unavailable", () => {
  assert.equal(tooltipContent({}, profile, "skill", profile.characterSkills[0]), null);
  assert.equal(tooltipContent(controller, profile, "skill", { skillHrid: "/skills/absent" }), null);
  assert.equal(tooltipContent(controller, profile, "bad", {}), null);
  const cycle = {};
  cycle.type = cycle;
  assert.equal(componentClass(cycle), null);
});
test("native renderer reads only cached ReactDOM and unmounts its own tooltip roots", () => {
  const calls = [];
  const dom = {
    render: (content, node) => calls.push(["render", content.kind, node]),
    unmountComponentAtNode: (node) => calls.push(["clear", node])
  };
  const runtime = { c: { game: { exports: dom } }, m: {} };
  const queue = [];
  queue.push = ([_ids, modules]) => {
    for (const [id, factory] of Object.entries(modules)) {
      runtime.m[id] = factory;
      runtime.c[id] = { exports: {} };
      factory(runtime.c[id], {}, runtime);
    }
  };
  const api = createRenderer({ page: { webpackJsonprpg_web: queue }, getController: () => controller });
  const container = {};
  assert.equal(api.render(container, profile, "skill", profile.characterSkills[0]), true);
  assert.equal(api.render(container, profile, "item", profile.wearableItemMap.legs), true);
  assert.deepEqual(Object.keys(runtime.c), ["game"]);
  assert.deepEqual(Object.keys(runtime.m), []);
  api.dispose();
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["render", "clear", "render", "clear"]
  );
});
test("renderer fails safely before webpack is initialized or when native rendering throws", () => {
  const api = createRenderer({ page: { webpackJsonprpg_web: [] }, getController: () => controller });
  assert.equal(api.render({}, profile, "skill", profile.characterSkills[0]), false);
  const bad = createRenderer({
    page: {},
    getController: () => {
      throw Error("unmounted");
    }
  });
  assert.equal(bad.render({}, profile, "skill", profile.characterSkills[0]), false);
});
