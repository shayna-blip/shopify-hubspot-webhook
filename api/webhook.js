export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const order = req.body;

    let designUrl = null;

    for (const item of order.line_items || []) {
      for (const prop of item.properties || []) {
        if (
          typeof prop.value === "string" &&
          prop.value.includes("cdnv2.mycustomizer.com")
        ) {
          designUrl = prop.value;
          break;
        }
      }
      if (designUrl) break;
    }

    if (!designUrl) {
      return res.status(200).json({ message: "No design URL found" });
    }

    // wait for HubSpot to finish creating the order
    await new Promise((r) => setTimeout(r, 3000));

    const searchRes = await fetch(
      "https://api.hubapi.com/crm/v3/objects/orders/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "hs_order_number",
                  operator: "EQ",
                  value: String(order.order_number),
                },
              ],
            },
          ],
          limit: 1,
        }),
      }
    );

    const searchData = await searchRes.json();
    const orderId = searchData?.results?.[0]?.id;

    if (!orderId) {
      return res.status(200).json({ message: "Order not in HubSpot yet" });
    }

    await fetch(
      `https://api.hubapi.com/crm/v3/objects/orders/${orderId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            design_proof_url: designUrl,
          },
        }),
      }
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Webhook failed" });
  }
}


