import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { jarLayout, jarFill, jarWishes } from "../src/lib/wish-jar";
import WishJar from "../src/components/WishJar";
import type { Wish, WishList } from "../src/lib/keepsakes";
const lists: WishList[] = [
  {
    id: "shared",
    owner_id: "you",
    type: "shared",
    title: "Together",
    cover: "",
  },
  {
    id: "secret",
    owner_id: "partner",
    type: "secret",
    title: "Hidden",
    cover: "",
  },
];
function wish(
  i: number,
  list_id = "shared",
  status: Wish["status"] = "wished",
): Wish {
  return {
    id: String(i).padStart(3, "0"),
    list_id,
    created_by: "partner",
    title: `Wish ${i}`,
    note: "",
    url: "",
    price: null,
    currency: "PHP",
    image_path: null,
    category: "",
    priority: 1,
    status,
    planned_date: null,
    done_at: null,
    position: 0,
    created_at: new Date(1700000000000 + i).toISOString(),
  };
}
test("jar includes only active accessible wishes, never partner secret ideas", () => {
  const items = [
    wish(1),
    wish(2, "shared", "planned"),
    wish(3, "shared", "done"),
    wish(4, "secret"),
  ];
  assert.deepEqual(
    jarWishes(items, lists, "you").map((w) => w.id),
    ["001", "002"],
  );
  assert.equal(jarWishes(items, lists, "you", ["secret"]).length, 0);
  assert.equal(jarWishes(items, lists, "partner").length, 3);
  const html = renderToString(
    React.createElement(WishJar, {
      wishes: items,
      lists,
      user: "you",
      scope: "test",
    }),
  );
  assert.doesNotMatch(html, /Wish 4/);
  assert.match(html.replace(/<!--.*?-->/g, ""), /2 wishes/);
});
test("100 wishes render at most 40 deterministic notes, inside glass and without collisions", () => {
  const items = Array.from({ length: 100 }, (_, i) => wish(i));
  const layout = jarLayout(items);
  assert.equal(layout.length, 40);
  assert.deepEqual(layout, jarLayout([...items].reverse()));
  assert.equal(layout.at(-1)?.wish.id, "099");
  assert.equal(jarFill(100), 0.9);
  assert.equal(jarFill(200), 0.9);
  const boxes = layout.map((n) => {
    const angle = (Math.abs(n.angle) * Math.PI) / 180;
    const dx = 16.8 * Math.cos(angle) + 10.08 * Math.sin(angle),
      dy = 16.8 * Math.sin(angle) + 10.08 * Math.cos(angle);
    return { l: n.x - dx, r: n.x + dx, t: n.y - dy, b: n.y + dy };
  });
  for (const b of boxes) {
    assert.ok(b.l >= 65 && b.r <= 255 && b.t >= 110 && b.b <= 320);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      assert.ok(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
    }
  const html = renderToString(
    React.createElement(WishJar, {
      wishes: items,
      lists,
      user: "you",
      scope: "many",
      mini: true,
    }),
  );
  assert.equal((html.match(/class="jar-note /g) || []).length, 40);
});
