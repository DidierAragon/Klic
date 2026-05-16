import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured')
    }

    // Generar token TURN de Twilio (válido por 1 hora)
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`
    const credentials = btoa(`${accountSid}:${authToken}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'Ttl=3600',
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Twilio error: ${error}`)
    }

    const data = await response.json()

    // Formatear los ICE servers para WebRTC
    const iceServers = data.ice_servers.map((server: any) => {
      const config: any = { urls: server.url }
      if (server.username) config.username = server.username
      if (server.credential) config.credential = server.credential
      return config
    })

    return new Response(
      JSON.stringify({ iceServers }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})