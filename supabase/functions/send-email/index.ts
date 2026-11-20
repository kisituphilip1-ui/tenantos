import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const { type, to, tenantName, propertyName, amount, dueDate } = await req.json();

    let subject = "";
    let html = "";

    if (type === "receipt") {
      subject = `Rent Receipt — ${propertyName} | Haven Uganda`;
      html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
          <div style="background:#0d9488;padding:24px;border-radius:8px;text-align:center;margin-bottom:24px;">
            <h1 style="color:white;margin:0;font-size:24px;">Haven Uganda</h1>
            <p style="color:#99f6e4;margin:8px 0 0;">Rent Receipt</p>
          </div>
          <div style="background:white;padding:24px;border-radius:8px;">
            <p>Dear <strong>${tenantName}</strong>,</p>
            <p>Your rent payment has been received. Here are your details:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr style="background:#f0fdfa;"><td style="padding:12px;border:1px solid #99f6e4;"><strong>Property</strong></td><td style="padding:12px;border:1px solid #99f6e4;">${propertyName}</td></tr>
              <tr><td style="padding:12px;border:1px solid #e5e7eb;"><strong>Amount Paid</strong></td><td style="padding:12px;border:1px solid #e5e7eb;">UGX ${amount}</td></tr>
              <tr style="background:#f0fdfa;"><td style="padding:12px;border:1px solid #99f6e4;"><strong>Date</strong></td><td style="padding:12px;border:1px solid #99f6e4;">${new Date().toLocaleDateString("en-UG")}</td></tr>
            </table>
            <p style="color:#6b7280;font-size:13px;">This is an official receipt from Haven Uganda Property Management.</p>
          </div>
          <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">Haven for Uganda · Secure by design</p>
        </div>
      `;
    } else if (type === "reminder") {
      subject = `Rent Reminder — Due ${dueDate} | Haven Uganda`;
      html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
          <div style="background:#0d9488;padding:24px;border-radius:8px;text-align:center;margin-bottom:24px;">
            <h1 style="color:white;margin:0;font-size:24px;">Haven Uganda</h1>
            <p style="color:#99f6e4;margin:8px 0 0;">Rent Reminder</p>
          </div>
          <div style="background:white;padding:24px;border-radius:8px;">
            <p>Dear <strong>${tenantName}</strong>,</p>
            <p>This is a friendly reminder that your rent is due soon:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr style="background:#fff7ed;"><td style="padding:12px;border:1px solid #fed7aa;"><strong>Property</strong></td><td style="padding:12px;border:1px solid #fed7aa;">${propertyName}</td></tr>
              <tr><td style="padding:12px;border:1px solid #e5e7eb;"><strong>Amount Due</strong></td><td style="padding:12px;border:1px solid #e5e7eb;">UGX ${amount}</td></tr>
              <tr style="background:#fff7ed;"><td style="padding:12px;border:1px solid #fed7aa;"><strong>Due Date</strong></td><td style="padding:12px;border:1px solid #fed7aa;">${dueDate}</td></tr>
            </table>
            <p>Please ensure payment is made on time to avoid any late fees.</p>
            <p style="color:#6b7280;font-size:13px;">Contact your property manager if you have any questions.</p>
          </div>
          <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">Haven for Uganda · Secure by design</p>
        </div>
      `;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Haven Uganda <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify({ success: true, data }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});