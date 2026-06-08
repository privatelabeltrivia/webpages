import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

import { supabase } from './supabaseClient.js'

async function getData() {
  const { data, error } = await supabase.from('your_table').select('*')
  console.log(data)
}

getData()

const supabaseUrl = 'https://aoiohntzkbphhkckylfg.supabase.co';
const supabaseKey = 'YOUR_ANON_KEY';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

export async function insertData(name, email) {
    const { data, error } = await supabase
        .from('your_table_name')
        .insert([{ name, email }]);
    return { data, error };
}

export async function fetchData() {
    return await supabase.from('your_table_name').select('*');
}