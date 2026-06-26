const { computeLayout, findLayoutIssues } = require("../layout");

const devices = [
  { name: "iPhone SE landscape", width: 667, height: 375 },
  { name: "iPhone 12/13 landscape", width: 844, height: 390 },
  { name: "iPhone 14 Pro landscape", width: 852, height: 393 },
  { name: "iPhone 15 Pro Max landscape", width: 932, height: 430 },
  { name: "small Android landscape", width: 740, height: 360 },
  { name: "tablet compact landscape", width: 1024, height: 768 }
];

const handCounts = [4, 8, 17, 24, 26, 30, 33];

let failed = false;

for (const device of devices) {
  for (const handCount of handCounts) {
    const layout = computeLayout(device.width, device.height, handCount);
    const issues = findLayoutIssues(layout);
    const summary = [
      `${device.name}`,
      `${device.width}x${device.height}`,
      `cards=${handCount}`,
      `card=${Math.round(layout.handCard.w)}x${Math.round(layout.handCard.h)}`,
      `step=${layout.handCard.step.toFixed(1)}`,
      `scale=${layout.scale.toFixed(3)}`
    ].join(" | ");

    if (issues.length) {
      failed = true;
      console.error(`FAIL | ${summary}`);
      for (const issue of issues) console.error(`  - ${issue}`);
    } else {
      console.log(`OK   | ${summary}`);
    }
  }
}

if (failed) {
  process.exit(1);
}
