import { supabase, isSupabaseConfigured } from '../../core/services/supabaseClient';

export interface ProductReview {
  id: string;
  product_id: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface RatingStats {
  average: number;
  total: number;
}

// Module-level cache to avoid duplicate queries across cards
const statsCache = new Map<string, RatingStats>();

const STORAGE_KEY = 'naturerva_reviews';

function getLocalReviews(): ProductReview[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalReviews(reviews: ProductReview[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
}

function computeStats(ratings: number[]): RatingStats {
  if (!ratings.length) return { average: 0, total: 0 };
  const sum = ratings.reduce((a, b) => a + b, 0);
  const average = Math.round((sum / ratings.length) * 10) / 10;
  return { average, total: ratings.length };
}

export async function getProductRating(productId: string): Promise<RatingStats> {
  if (statsCache.has(productId)) return statsCache.get(productId)!;

  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('rating')
        .eq('product_id', productId);

      if (!error && data) {
        const stats = computeStats(data.map((r) => r.rating));
        statsCache.set(productId, stats);
        return stats;
      }
    } catch {
      // fall through to localStorage
    }
  }

  const reviews = getLocalReviews().filter((r) => r.product_id === productId);
  const stats = computeStats(reviews.map((r) => r.rating));
  statsCache.set(productId, stats);
  return stats;
}

export async function getProductReviews(productId: string): Promise<ProductReview[]> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (!error && data) return data as ProductReview[];
    } catch {
      // fall through to localStorage
    }
  }

  return getLocalReviews()
    .filter((r) => r.product_id === productId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function submitReview(
  productId: string,
  userName: string,
  rating: number,
  comment: string
): Promise<void> {
  const review: ProductReview = {
    id: crypto.randomUUID(),
    product_id: productId,
    user_name: userName.trim(),
    rating,
    comment: comment.trim(),
    created_at: new Date().toISOString(),
  };

  let savedToSupabase = false;

  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase.from('product_reviews').insert([review]);
      if (!error) savedToSupabase = true;
    } catch {
      // fall through to localStorage
    }
  }

  if (!savedToSupabase) {
    const reviews = getLocalReviews();
    reviews.unshift(review);
    saveLocalReviews(reviews);
  }

  // Invalidate cache so next fetch reflects new review
  statsCache.delete(productId);
}
