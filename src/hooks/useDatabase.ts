import { useState, useEffect, useCallback } from 'react';
import { subscribe, loadDatabase, getProducts, getCategories, getOrders, getRegister, getUsers, getActivityLog, getSettings, getDebtors } from '../services/database';
import type { Product, Category, Order, RegisterState, StoreUser, ActivityLog, StoreSettings, Debtor } from '../types/types';

export function useDatabase() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [register, setRegister] = useState<RegisterState>({ currentBalance: 0, transactions: [] });
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [settings, setSettings] = useState<StoreSettings>({ companyName: 'Merbana POS' });
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setProducts(getProducts());
    setCategories(getCategories());
    setOrders(getOrders());
    setRegister(getRegister());
    setUsers(getUsers());
    setActivityLog(getActivityLog());
    setSettings(getSettings());
    setDebtors(getDebtors());
  }, []);

  useEffect(() => {
    loadDatabase().then(() => {
      refresh();
      setLoading(false);
    });
  }, [refresh]);

  useEffect(() => {
    return subscribe(refresh);
  }, [refresh]);

  return { products, categories, orders, register, users, activityLog, settings, debtors, loading };
}

