export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const order = req.body;

    // 1. Get Shopify order number (ex: 1358)
    const shopifyOrderNumber = String(order.order_number);

    // 2. Extract Kickflip design URL
    let designUrl = null;

    for (const item of order.line_items || []) {
      if (item.properties) {
        for (const prop of item.properties) {
          if (
            prop.value &&
            typeof prop.value === "string" &&
            prop.value.includes("cdnv2.mycustomizer.com")
          ) {
            designUrl = prop.value;
            break;
          }
        }
      }
      if (designUrl) break;
    }

    // No design = nothing to update (still success)
    if (!designUrl) {
      return res.status(200).json({ message: "No design URL found" });
    }

    // 3. Get HubSpot orders (LIST, not SEARCH)
    const listRes = await fetch(
      "https://api.hubapi.com/crm/v3/objects/orders?limit=100",
      {
        headers: {
          Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
        },
      }
    );

    const listData = await listRes.json();

    if (!listData.results) {
      return res.status(500).json({ error: "Failed to fetch HubSpot orders" });
    }

    // Match HubSpot order by hs_order_number
    const matchedOrder = listData.results.find(
      (o) => o.properties.hs_order_number === shopifyOrderNumber
    );

    if (!matchedOrder) {
      return res
        .status(404)
        .json({ message: "HubSpot order not found" });
    }

    const hubspotOrderId = matchedOrder.id;

    // 4. Update Design Proof URL in HubSpot
    await fetch(
      `https://api.hubapi.com/crm/v3/objects/orders/${hubspotOrderId}`,
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

