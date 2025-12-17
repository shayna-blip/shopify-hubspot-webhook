export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const order = req.body;

    // Shopify order number (e.g. 1358)
    const shopifyOrderNumber = String(order.order_number);

    // Find Kickflip / MyCustomizer image URL
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
      console.log("No design URL found");
      return res.status(200).json({ message: "No design URL found" });
    }

    // Search HubSpot Order by order number
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
                  value: shopifyOrderNumber,
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
      console.error("HubSpot order not found", searchData);
      return res.status(404).json({ message: "HubSpot order not found" });
    }

    // Update Design Proof URL
    const updateRes = await fetch(
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

    if (!updateRes.ok) {
      const err = await updateRes.text();
      console.error("HubSpot update failed:", err);
      return res.status(500).json({ error: "Update failed" });
    }

    console.log("Design URL synced:", designUrl);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: "Webhook failed" });
  }
}
