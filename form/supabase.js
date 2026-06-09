// supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const supabaseUrl = SUPABASE_URL; 
const supabaseKey = SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing Supabase configuration!");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Add this to supabase.js
export async function getTeamIdByEmail(email) {
    const { data, error } = await supabase
        .from('TeamData') // Replace with your actual table name
        .select('id')
        .eq('Email', email)
        .eq('EventId', 1) // Assuming you want to filter by EventId as well
        .single(); // Use .single() because you only expect one match

    if (error) {
        console.error("Error fetching team ID:", error);
        return null;
    }
    return data ? data.id : null;
}

export async function getTeamNameByEmail(email) {
    const { data, error } = await supabase
        .from('TeamData') // Replace with your actual table name
        .select('TeamName')
        .eq('Email', email)
        .eq('EventId', 1) // Assuming you want to filter by EventId as well
        .single(); // Use .single() because you only expect one match
        if (error) {
        console.error("Error fetching team name:", error);
        return null;
    }
    return data ? data.TeamName : null;
}

export async function getEventIdByVenueId(venueId) {
    const { data, error } = await supabase
        .from('Events') // Replace with your actual table name
        .select('id')
        .eq('VenueId', venueId)
        .eq('EventDate', new Date().toDateString()) // Filter for today's date
        .single();
        console.log("Fetched event ID:", data ? data.id : null);
    if (error) {
        console.error("Error fetching event ID:", error);
        const newEventId = await createNewEvent(venueId);
        console.log("Created new event with ID:", newEventId);
        if (newEventId) { return newEventId; }
        return null;
    }
    return data ? data.id : null;
}

export async function getVenueIdByVenueTag(venueTag) {
    const { data, error } = await supabase
        .from('Venues') // Replace with your actual table name
        .select('id')
        .eq('VenueTag', venueTag)
        .single();
    if (error) {
        console.error("Error fetching venue ID:", error);
        return null;
    }
    console.log("Fetched venue ID:", data ? data.id : null);
    return data ? data.id : null;
}

export async function createNewEvent(venueId) {
    const { data, error } = await supabase
        .from('Events') // Replace with your actual table name
        .insert([{ VenueId: venueId, EventDate: new Date().toDateString() }])
        .select('id')
        .single();

    if (error) {
        console.error("Error creating new event:", error);
        return null;
    }
    console.log("New event created with ID:", data ? data.id : null);
    return data ? data.id : null;
}

export async function insertRegistrationSubmission(payload) {
    const venueId = await getVenueIdByVenueTag(payload.venueid);
    const eventId = await getEventIdByVenueId(venueId);
    const teamCount = parseInt(payload.formdata[2], 10);
    const doublePointsRound = parseInt(payload.formdata[3].split(' ')[1], 10);

    const cleanPayload = {
        EventId: eventId,
        Email: payload.formdata[0],
        TeamName: payload.formdata[1],
        TeamCount: teamCount,
        DoublePointsRound: doublePointsRound,
        EmailUpdates: payload.formdata[4] || ''
    }
    console.log("Inserting registration submission with payload:", cleanPayload);
    const { data, error } = await supabase
        .from('TeamData') // Ensure this matches your table name
        .insert([cleanPayload]);
}

export async function insertScoringRoundSubmission(payload) {
    const venueId = await getVenueIdByVenueTag(payload.venueid);
    const eventId = await getEventIdByVenueId(venueId);
    const teamId = await getTeamIdByEmail(payload.formdata[0]);

    const cleanPayload = {
        EventId: eventId,
        TeamId: teamId,
        RoundNum: payload.roundid,
        Q00: payload.formdata[1],
        Q01: payload.formdata[2],
        Q02: payload.formdata[3],
        Q03: payload.formdata[4],
        Q04: payload.formdata[5],
        Q05: payload.formdata[6],
        Q06: payload.formdata[7],
        Q07: payload.formdata[8],
        Q08: payload.formdata[9],
        Q09: payload.formdata[10],
        Q10: payload.formdata[11],
        Q11: payload.formdata[12]
    }
    console.log("Inserting scoring round submission with payload:", cleanPayload);
    const { data, error } = await supabase
        .from('RoundData') // Ensure this matches your table name
        .insert([cleanPayload]);
    
    if (error) throw error;
    console.log("Scoring round submission inserted successfully:", data);
    return data;
}
