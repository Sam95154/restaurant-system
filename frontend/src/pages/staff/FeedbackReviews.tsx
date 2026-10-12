import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

interface BranchOption { id: string; name: string; }
interface ReviewRow {
  id: string;
  itemRating: number | null;
  restaurantRating: number | null;
  text: string | null;
  approved: boolean;
  createdAt: string;
  customer?: { fullName: string | null } | null;
  order?: { orderNumber: number; branch?: { name: string } | null } | null;
}

export default function FeedbackReviews() {
  const { employee } = useAuth();
  const isSuperAdmin = employee?.role === 'SUPER_ADMIN';
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState('');
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.get('/branches')
      .then((response) => setBranches(response.data?.branches ?? []))
      .catch(() => setError('Could not load the branch list.'));
  }, [isSuperAdmin]);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/reviews', {
        params: isSuperAdmin && branchId ? { branchId } : {},
      });
      setReviews(response.data?.reviews ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not load feedback and reviews.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, branchId]);

  useEffect(() => { void loadReviews(); }, [loadReviews, refreshKey]);

  const averageRating = useMemo(() => {
    const ratings = reviews.map((review) => review.restaurantRating ?? review.itemRating).filter((rating): rating is number => typeof rating === 'number');
    return ratings.length ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1) : '—';
  }, [reviews]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-coffee/50">Customer experience</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-coffee-dark">Feedback &amp; Reviews</h1>
          <p className="mt-2 text-sm text-coffee/60">
            {isSuperAdmin ? 'Review customer feedback across your restaurant branches.' : 'Review feedback submitted for your branch only.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isSuperAdmin && (
            <label className="text-sm font-medium text-coffee-dark">
              Branch
              <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-1 block min-w-48 rounded-xl border border-coffee/20 bg-white px-3 py-2.5">
                <option value="">All branches</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="rounded-xl bg-turmeric px-4 py-2.5 text-sm font-bold text-coffee-dark">Refresh</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-coffee/10 bg-white p-5"><p className="text-sm text-coffee/60">Total reviews</p><p className="mt-2 text-3xl font-bold text-coffee-dark">{reviews.length}</p></div>
        <div className="rounded-2xl border border-coffee/10 bg-white p-5"><p className="text-sm text-coffee/60">Average rating</p><p className="mt-2 text-3xl font-bold text-coffee-dark">{averageRating}<span className="ml-1 text-lg text-turmeric">★</span></p></div>
        <div className="rounded-2xl border border-coffee/10 bg-white p-5"><p className="text-sm text-coffee/60">With comments</p><p className="mt-2 text-3xl font-bold text-coffee-dark">{reviews.filter((review) => !!review.text?.trim()).length}</p></div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-coffee/10 bg-white p-8 text-center text-sm text-coffee/60">Loading reviews…</div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-coffee/20 bg-white p-10 text-center">
          <div className="text-4xl text-turmeric">★</div>
          <h2 className="mt-3 text-lg font-bold text-coffee-dark">No reviews yet</h2>
          <p className="mt-1 text-sm text-coffee/60">Customer feedback will appear here after customers submit a review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const rating = review.restaurantRating ?? review.itemRating;
            return (
              <article key={review.id} className="rounded-2xl border border-coffee/10 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div>
                    <h2 className="font-bold text-coffee-dark">{review.customer?.fullName?.trim() || 'Customer'}</h2>
                    <p className="mt-1 text-xs text-coffee/50">
                      {review.order?.orderNumber ? `Order #${review.order.orderNumber}` : 'Order unavailable'}
                      {isSuperAdmin && review.order?.branch?.name ? ` · ${review.order.branch.name}` : ''}
                      {' · '}{new Date(review.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-lg tracking-widest text-turmeric" aria-label={rating ? `${rating} out of 5 stars` : 'No rating'}>
                    {rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'No rating'}
                  </div>
                </div>
                {(review.itemRating || review.restaurantRating) && (
                  <p className="mt-3 text-xs text-coffee/60">
                    {review.restaurantRating ? `Restaurant: ${review.restaurantRating}/5` : ''}
                    {review.restaurantRating && review.itemRating ? ' · ' : ''}
                    {review.itemRating ? `Food: ${review.itemRating}/5` : ''}
                  </p>
                )}
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-coffee/80">{review.text?.trim() || 'No written comment.'}</p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
