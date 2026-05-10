-- Table for user wallets
CREATE TABLE IF NOT EXISTS public.wallets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance BIGINT DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for coin transactions
CREATE TABLE IF NOT EXISTS public.coin_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('purchase', 'spent', 'tip', 'payout')),
    amount BIGINT NOT NULL, -- positive for credit, negative for debit
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for coin packages
CREATE TABLE IF NOT EXISTS public.coin_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    coins_amount BIGINT NOT NULL,
    price_usd NUMERIC(10, 2) NOT NULL,
    active BOOLEAN DEFAULT TRUE
);

-- Initial packages
INSERT INTO public.coin_packages (name, coins_amount, price_usd) VALUES
('Pack Inicial', 100, 0.99),
('Pack Estándar', 550, 4.99),
('Pack Premium', 1200, 9.99),
('Pack Pro', 2500, 19.99);

-- Function to handle content purchase with coins
CREATE OR REPLACE FUNCTION buy_content_with_coins(
    p_user_id UUID,
    p_content_id UUID,
    p_content_type TEXT, -- 'foto', 'video', 'opinion'
    p_cost BIGINT,
    p_creator_id UUID
) RETURNS JSON AS $$
DECLARE
    v_balance BIGINT;
BEGIN
    -- Check balance
    SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_user_id;
    
    IF v_balance < p_cost THEN
        RETURN json_build_object('success', false, 'message', 'Saldo insuficiente');
    END IF;

    -- Deduct from buyer
    UPDATE public.wallets 
    SET balance = balance - p_cost, 
        updated_at = NOW() 
    WHERE user_id = p_user_id;

    -- Record transaction for buyer
    INSERT INTO public.coin_transactions (user_id, type, amount, description, metadata)
    VALUES (p_user_id, 'spent', -p_cost, 'Compra de contenido premium', 
            json_build_object('content_id', p_content_id, 'content_type', p_content_type));

    -- Add to creator (optional, depending on business model, e.g. 80% to creator)
    UPDATE public.wallets 
    SET balance = balance + p_cost, 
        updated_at = NOW() 
    WHERE user_id = p_creator_id;

    -- Record transaction for creator
    INSERT INTO public.coin_transactions (user_id, type, amount, description, metadata)
    VALUES (p_creator_id, 'payout', p_cost, 'Ingreso por venta de contenido', 
            json_build_object('content_id', p_content_id, 'buyer_id', p_user_id));

    -- Register the purchase in the 'compras' table (if it exists)
    -- Note: Ensure 'compras' table exists or remove this part
    INSERT INTO public.compras (user_id, id_contenido, tipo_contenido)
    VALUES (p_user_id, p_content_id, p_content_type);

    RETURN json_build_object('success', true, 'message', 'Compra realizada con éxito');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create wallet on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (NEW.id, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created_wallet ON auth.users;
CREATE TRIGGER on_auth_user_created_wallet
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_wallet();

-- Enable RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_packages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own wallet" ON public.wallets;
CREATE POLICY "Users can view their own wallet" ON public.wallets
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own transactions" ON public.coin_transactions;
CREATE POLICY "Users can view their own transactions" ON public.coin_transactions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can view active packages" ON public.coin_packages;
CREATE POLICY "Anyone can view active packages" ON public.coin_packages
    FOR SELECT USING (active = true);
-- Function to increment wallet balance safely
CREATE OR REPLACE FUNCTION increment_wallet_balance(
    p_user_id UUID,
    p_amount BIGINT
) RETURNS VOID AS $$
BEGIN
    UPDATE public.wallets 
    SET balance = balance + p_amount, 
        updated_at = NOW() 
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
