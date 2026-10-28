import { supabase } from './supabase';
import { readAllPages } from './prBadges';
import type { ExportReader, Raw } from './dataExport';

// Database calls for "Export my data". Every table is private to the signed-in person (the database only returns their own rows), so nothing here
// filters by user. Rows are read a page at a time in a fixed order (by id), because the database caps each request and a changing order could skip or repeat rows.
// The safety limits are far above any real account; if one is hit the part is reported as incomplete rather than quietly cut short.

const PAGE = 1000;
const MAX_ROWS = 250_000;
const MAX_REQUESTS = 400;

export const supabaseReader: ExportReader = async (dataset) => {
  if (dataset.single) {
    const { data: userData } = await supabase.auth.getUser();
    const id = userData.user?.id;
    if (!id) throw new Error('Not signed in.');
    const { data, error } = await supabase.from(dataset.table).select(dataset.select).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return { rows: data ? [data as unknown as Raw] : [], complete: true };
  }
  return readAllPages<Raw>(
    async (from, to) => {
      const { data, error } = await supabase.from(dataset.table).select(dataset.select).order('id').range(from, to);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Raw[];
    },
    PAGE,
    MAX_ROWS,
    MAX_REQUESTS
  );
};
