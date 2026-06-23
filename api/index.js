import { Redis } from "@upstash/redis";
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // POST — terima webhook dari Saweria
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string"
        ? JSON.parse(req.body) : req.body;

      const donator = body.donator_name || body.donator || body.name || "Unknown";
      const amount  = body.amount_raw   || body.amount  || 0;
      const message = body.message      || "...";

      if (!donator || Number(amount) <= 0)
        return res.status(400).json({ error: "Invalid data" });

      const numAmount = Number(amount);

      // Simpan donasi terbaru (expire 5 menit)
      await redis.setex("infinityclub_pending", 300, JSON.stringify({
        donator, amount: numAmount, message
      }));

      // Update leaderboard
      let lb = await redis.get("infinityclub_leaderboard") || [];
      if (typeof lb === "string") lb = JSON.parse(lb);

      const existing = lb.find(e =>
        e.member.toLowerCase() === donator.toLowerCase()
      );
      if (existing) existing.score += numAmount;
      else lb.push({ member: donator, score: numAmount });

      lb.sort((a, b) => b.score - a.score);
      await redis.set("infinityclub_leaderboard", JSON.stringify(lb));

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET — dibaca Roblox setiap 4 detik
  if (req.method === "GET") {
    try {
      const data = await redis.get("infinityclub_pending");
      if (!data) return res.status(200).send("null");

      await redis.del("infinityclub_pending");

      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      return res.status(200).json(parsed);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
