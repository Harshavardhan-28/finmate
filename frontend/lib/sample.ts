/** Draw a believable cab-ride receipt on a canvas so the demo works without a real photo. */
export function sampleReceipt(): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 520;
  c.height = 760;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#111";
  g.font = "bold 54px Arial";
  g.fillText("Uber", 40, 90);
  g.font = "22px Arial";
  g.fillStyle = "#555";
  g.fillText("Trip receipt", 40, 125);
  const d = new Date();
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  g.fillStyle = "#111";
  g.font = "24px Arial";
  const rows: [string, string][] = [
    ["Date", date],
    ["Trip", "Home to Office"],
    ["Distance", "11.2 km"],
    ["Base fare", "₹ 312.00"],
    ["Surge", "₹ 88.00"],
    ["Taxes & fees", "₹ 50.00"],
  ];
  rows.forEach(([k, v], i) => {
    const y = 200 + i * 52;
    g.fillStyle = "#666";
    g.fillText(k, 40, y);
    g.fillStyle = "#111";
    g.textAlign = "right";
    g.fillText(v, 480, y);
    g.textAlign = "left";
  });
  g.fillStyle = "#111";
  g.fillRect(40, 535, 440, 3);
  g.font = "bold 36px Arial";
  g.fillText("Total", 40, 600);
  g.textAlign = "right";
  g.fillText("₹ 450.00", 480, 600);
  g.textAlign = "left";
  g.font = "20px Arial";
  g.fillStyle = "#666";
  g.fillText("Paid with UPI", 40, 660);
  g.fillText("Thanks for riding with Uber", 40, 700);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}
