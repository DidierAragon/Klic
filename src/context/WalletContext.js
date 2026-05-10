import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

const WalletContext = createContext();

export const WalletProvider = ({ children, session }) => {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchWallet();
      fetchPackages();
      
      // Subscribe to wallet changes
      const subscription = supabase
        .channel(`public:wallets:user_id=eq.${session.user.id}`)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'wallets', 
          filter: `user_id=eq.${session.user.id}` 
        }, payload => {
          setBalance(payload.new.balance);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    } else {
      setBalance(0);
      setLoading(false);
    }
  }, [session]);

  const fetchWallet = async () => {
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', session.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching wallet:', error);
      } else if (data) {
        setBalance(data.balance);
      }
    } catch (err) {
      console.error('Wallet error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPackages = async () => {
    const { data, error } = await supabase
      .from('coin_packages')
      .select('*')
      .eq('active', true)
      .order('price_usd', { ascending: true });

    if (!error) {
      setPackages(data);
    }
  };

  const buyContent = async (contentId, contentType, cost, creatorId) => {
    const { data, error } = await supabase.rpc('buy_content_with_coins', {
      p_user_id: session.user.id,
      p_content_id: contentId,
      p_content_type: contentType,
      p_cost: cost,
      p_creator_id: creatorId
    });

    if (error) throw error;
    return data;
  };

  return (
    <WalletContext.Provider value={{ balance, packages, loading, buyContent, refreshWallet: fetchWallet }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
