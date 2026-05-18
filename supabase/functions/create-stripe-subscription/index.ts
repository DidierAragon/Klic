import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import Stripe from 'https://esm.sh/stripe@14.16.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '')

Deno.serve(async (req) => {
  console.log("--- Nueva petición de suscripción recibida ---")
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: { 
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Methods': 'POST', 
        'Access-Control-Allow-Headers': '*' 
      } 
    })
  }

  try {
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()
    if (authError || !user) {
      console.error("Error de autenticación:", authError)
      throw new Error('No autorizado')
    }

    const body = await req.json()
    const { creatorId } = body

    if (!creatorId) {
      throw new Error('El ID del creador es obligatorio')
    }

    if (creatorId === user.id) {
      throw new Error('No puedes suscribirte a ti mismo')
    }

    // 1. Obtener perfil del suscriptor (Edad y Stripe Customer ID)
    const { data: perfilSuscriptor } = await supabaseAdmin
      .from('users')
      .select('fecha_nacimiento, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()

    function edadDesdeFecha(fecha: string | null | undefined): number | null {
      if (!fecha || !/^\d{4}-\d{2}-\d{2}/.test(fecha)) return null
      const nac = new Date(fecha)
      if (Number.isNaN(nac.getTime())) return null
      const hoy = new Date()
      let edad = hoy.getFullYear() - nac.getFullYear()
      const m = hoy.getMonth() - nac.getMonth()
      if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
      return edad
    }

    const fechaNac = perfilSuscriptor?.fecha_nacimiento ?? (user.user_metadata?.fecha_nacimiento as string | undefined) ?? null
    const edad = edadDesdeFecha(fechaNac)
    
    if (edad === null || edad < 18) {
      throw new Error('Debes ser mayor de 18 años para suscribirte a creadores.')
    }

    // 2. Obtener detalles de la suscripción del creador
    const { data: perfilCreador } = await supabaseAdmin
      .from('users')
      .select('nombre, precio_suscripcion, nombre_suscripcion, descripcion_suscripcion, stripe_product_id, stripe_price_id')
      .eq('id', creatorId)
      .maybeSingle()

    if (!perfilCreador) {
      throw new Error('Creador no encontrado')
    }

    const precioSuscripcion = Number(perfilCreador.precio_suscripcion) || 0
    if (precioSuscripcion <= 0) {
      throw new Error('Este creador no tiene configurada una suscripción de pago.')
    }

    // 3. Crear cliente en Stripe si no existe
    let customerId = perfilSuscriptor?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      })
      customerId = customer.id

      // Guardar en base de datos
      await supabaseAdmin
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // 4. Asegurar Producto y Precio en Stripe para el creador
    let priceId = perfilCreador.stripe_price_id
    let productId = perfilCreador.stripe_product_id

    // Si no tiene Producto/Precio creados en Stripe, los creamos
    if (!priceId || !productId) {
      const product = await stripe.products.create({
        name: `${perfilCreador.nombre} - ${perfilCreador.nombre_suscripcion || 'Suscripción VIP'}`,
        description: perfilCreador.descripcion_suscripcion || 'Acceso ilimitado a todo el contenido premium',
        metadata: { creatorId: creatorId }
      })
      productId = product.id

      const price = await stripe.prices.create({
        product: productId,
        unit_amount: Math.round(precioSuscripcion * 100),
        currency: 'usd',
        recurring: { interval: 'month' },
      })
      priceId = price.id

      // Actualizar datos del creador en la BD
      await supabaseAdmin
        .from('users')
        .update({
          stripe_product_id: productId,
          stripe_price_id: priceId
        })
        .eq('id', creatorId)
    }

    // 5. Crear Llave Efímera para el PaymentSheet
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2023-10-16' }
    )

    // 6. Verificar si ya existe suscripción activa
    const { data: existingSub } = await supabaseAdmin
      .from('suscripciones')
      .select('id, status')
      .eq('subscriber_id', user.id)
      .eq('creator_id', creatorId)
      .maybeSingle()

    if (existingSub?.status === 'active') {
      throw new Error('Ya tienes una suscripción activa con este creador.')
    }

    // 7. Crear la suscripción en Stripe
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        subscriberId: user.id,
        creatorId: creatorId,
      }
    })

    const invoice = subscription.latest_invoice as any
    const paymentIntent = invoice.payment_intent

    if (!paymentIntent) {
      throw new Error('No se pudo generar el intento de pago para la suscripción.')
    }

    // 8. Registrar/Actualizar suscripción en estado 'incomplete' en la base de datos
    await supabaseAdmin
      .from('suscripciones')
      .upsert({
        subscriber_id: user.id,
        creator_id: creatorId,
        stripe_subscription_id: subscription.id,
        status: 'incomplete',
        precio: precioSuscripcion,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
      }, { onConflict: 'subscriber_id,creator_id' })

    // 9. Retornar credenciales al frontend
    return new Response(
      JSON.stringify({
        subscriptionId: subscription.id,
        clientSecret: paymentIntent.client_secret,
        customerId: customerId,
        ephemeralKey: ephemeralKey.secret
      }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )

  } catch (error) {
    console.error("Error al crear suscripción:", error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*' 
        } 
      }
    )
  }
})
