export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const order = req.body;

    // 1. Build HubSpot order name (matches HubSpot exactly)
    const hubspotOrderName = `#${order.order_number}`;

    // 2. Extract Kickflip / MyCustomizer design URL
    let designUrl = null;

    for (const item of order.line_items || []) {
      if (item.properties) {
        for (const prop of item.properties) {
          if (
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

    if (!designUrl) {
      return res.status(200).json({ message: "No design URL found" });
    }

    // 3. Find HubSpot order by NAME (this is the fix)
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
                  propertyName: "name",
                  operator: "EQ",
                  value: hubspotOrderName,
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
      return res.status(404).json({
        message: "HubSpot order not found",
        searchedName: hubspotOrderName,
      });
    }

    // 4. Update Design Proof URL
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

    return res.status(200).json({
      success: true,
      order: hubspotOrderName,
      designUrl,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Webhook failed" });
  }
}
