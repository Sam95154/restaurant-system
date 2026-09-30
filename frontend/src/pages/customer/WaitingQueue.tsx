import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';

type Branch = {
  id: string;
  name: string;
  status: string;
  logoUrl?: string | null;
};

type QueueEntry = {
  id: string;
  tokenNumber: number;
  queueToken: string;
  customerName: string;
  phone: string;
  partySize: number;
  status: 'WAITING' | 'CALLED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
  branchId: string;
  assignedTableId?: string | null;
  createdAt: string;
  calledAt?: string | null;
  seatedAt?: string | null;
  cancelledAt?: string | null;
  branch?: {
    id: string;
    name: string;
    logoUrl?: string | null;
  };
  assignedTable?: {
    id: string;
    number: number;
    capacity: number;
    status: string;
  } | null;
};

type QueueResponse = {
  queue: QueueEntry;
  position: number | null;
};

const API_ORIGIN =
  import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '') ||
  'http://localhost:4000';

function getLogoUrl(logoUrl?: string | null) {
  if (!logoUrl) return null;

  if (
    logoUrl.startsWith('http://') ||
    logoUrl.startsWith('https://')
  ) {
    return logoUrl;
  }

  return `${API_ORIGIN}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
}

function getBranchIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('branchId');
}

export default function WaitingQueue() {
  const initialBranchId = getBranchIdFromUrl();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(
    initialBranchId || '',
  );

  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState('2');

  const [queue, setQueue] = useState<QueueEntry | null>(null);
  const [position, setPosition] = useState<number | null>(null);

  const [loadingBranches, setLoadingBranches] = useState(true);
  const [joining, setJoining] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedBranch = useMemo(
    () =>
      branches.find(
        (branch) => branch.id === selectedBranchId,
      ),
    [branches, selectedBranchId],
  );

  const logoUrl = getLogoUrl(
    queue?.branch?.logoUrl ||
      selectedBranch?.logoUrl,
  );

  /*
  |--------------------------------------------------------------------------
  | LOAD OPEN BRANCHES
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    let mounted = true;

    async function loadBranches() {
      try {
        setLoadingBranches(true);
        setError('');

        const response = await api.get('/branches/public');

        const data = response.data;

        const loadedBranches: Branch[] = Array.isArray(data)
          ? data
          : data?.branches || [];

        if (!mounted) return;

        setBranches(
          loadedBranches.filter(
            (branch) => branch.status === 'OPEN',
          ),
        );

        if (
          initialBranchId &&
          loadedBranches.some(
            (branch) => branch.id === initialBranchId,
          )
        ) {
          setSelectedBranchId(initialBranchId);
        } else if (
          !initialBranchId &&
          loadedBranches.length === 1
        ) {
          setSelectedBranchId(loadedBranches[0].id);
        }
      } catch (err: any) {
        if (!mounted) return;

        setError(
          err?.response?.data?.error ||
            'Unable to load restaurant branches.',
        );
      } finally {
        if (mounted) {
          setLoadingBranches(false);
        }
      }
    }

    loadBranches();

    return () => {
      mounted = false;
    };
  }, [initialBranchId]);

  /*
  |--------------------------------------------------------------------------
  | RESTORE EXISTING QUEUE TOKEN
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const storedToken = localStorage.getItem(
      'waiting_queue_token',
    );

    if (!storedToken) return;

    let mounted = true;

    async function restoreQueue() {
      try {
        const response = await api.get(
          `/waiting-queue/public/${storedToken}`,
        );

        const data: QueueResponse = response.data;

        if (!mounted) return;

        setQueue(data.queue);
        setPosition(data.position);

        if (!selectedBranchId) {
          setSelectedBranchId(data.queue.branchId);
        }
      } catch {
        localStorage.removeItem(
          'waiting_queue_token',
        );
      }
    }

    restoreQueue();

    return () => {
      mounted = false;
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | REFRESH QUEUE STATUS
  |--------------------------------------------------------------------------
  */

  async function refreshQueue() {
    if (!queue?.queueToken) return;

    try {
      setRefreshing(true);

      const response = await api.get(
        `/waiting-queue/public/${queue.queueToken}`,
      );

      const data: QueueResponse = response.data;

      setQueue(data.queue);
      setPosition(data.position);
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          'Unable to refresh your queue status.',
      );
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!queue?.queueToken) return;

    const interval = window.setInterval(
      refreshQueue,
      10000,
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [queue?.queueToken]);

  /*
  |--------------------------------------------------------------------------
  | JOIN QUEUE
  |--------------------------------------------------------------------------
  */

  async function handleJoinQueue(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    setError('');
    setSuccess('');

    const cleanName = customerName.trim();
    const cleanPhone = phone.trim();
    const parsedPartySize = Number(partySize);

    if (!selectedBranchId) {
      setError('Please select a restaurant branch.');
      return;
    }

    if (!cleanName) {
      setError('Please enter your name.');
      return;
    }

    if (cleanPhone.length < 5) {
      setError('Please enter a valid phone number.');
      return;
    }

    if (
      !Number.isInteger(parsedPartySize) ||
      parsedPartySize < 1 ||
      parsedPartySize > 50
    ) {
      setError(
        'Number of people must be between 1 and 50.',
      );
      return;
    }

    try {
      setJoining(true);

      const response = await api.post(
        '/waiting-queue/public/join',
        {
          branchId: selectedBranchId,
          customerName: cleanName,
          phone: cleanPhone,
          partySize: parsedPartySize,
        },
      );

      const data: QueueResponse = response.data;

      setQueue(data.queue);
      setPosition(data.position);

      localStorage.setItem(
        'waiting_queue_token',
        data.queue.queueToken,
      );

      setSuccess(
        `You have joined the queue. Your token is ${data.queue.tokenNumber}.`,
      );
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          'Unable to join the waiting queue.',
      );
    } finally {
      setJoining(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LEAVE QUEUE VIEW
  |--------------------------------------------------------------------------
  */

  function startNewQueueEntry() {
    localStorage.removeItem(
      'waiting_queue_token',
    );

    setQueue(null);
    setPosition(null);

    setCustomerName('');
    setPhone('');
    setPartySize('2');

    setError('');
    setSuccess('');
  }

  /*
  |--------------------------------------------------------------------------
  | STATUS HELPERS
  |--------------------------------------------------------------------------
  */

  function getStatusTitle() {
    switch (queue?.status) {
      case 'WAITING':
        return 'You are in the queue';

      case 'CALLED':
        return 'Your table is ready';

      case 'SEATED':
        return 'You have been seated';

      case 'CANCELLED':
        return 'Queue entry cancelled';

      case 'NO_SHOW':
        return 'Marked as no-show';

      default:
        return 'Queue status';
    }
  }

  function getStatusMessage() {
    switch (queue?.status) {
      case 'WAITING':
        return position
          ? `There are ${Math.max(position - 1, 0)} parties ahead of you.`
          : 'We will update your position automatically.';

      case 'CALLED':
        return queue.assignedTable
          ? `Please proceed to Table ${queue.assignedTable.number}.`
          : 'Please proceed to the restaurant entrance.';

      case 'SEATED':
        return queue.assignedTable
          ? `You have been seated at Table ${queue.assignedTable.number}.`
          : 'You have been seated.';

      case 'CANCELLED':
        return 'This queue entry is no longer active.';

      case 'NO_SHOW':
        return 'This queue entry has been marked as no-show.';

      default:
        return '';
    }
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  if (queue) {
    return (
      <div className="min-h-screen bg-cream px-4 py-8">
        <div className="mx-auto w-full max-w-md">
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="bg-coffee-dark px-6 py-8 text-center text-white">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={queue.branch?.name || 'Restaurant'}
                  className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain bg-white p-2"
                />
              ) : (
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-2xl font-bold text-coffee-dark">
                  S
                </div>
              )}

              <h1 className="text-2xl font-bold">
                {queue.branch?.name || "Sam's Cafe"}
              </h1>

              <p className="mt-1 text-sm text-white/70">
                Restaurant Waiting Queue
              </p>
            </div>

            <div className="p-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">
                  Your Token
                </p>

                <div className="mt-2 text-7xl font-black text-coffee-dark">
                  {queue.tokenNumber}
                </div>

                <div className="mt-4 inline-flex rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700">
                  {getStatusTitle()}
                </div>
              </div>

              {queue.status === 'WAITING' &&
                position !== null && (
                  <div className="mt-6 rounded-2xl bg-cream p-5 text-center">
                    <p className="text-sm text-gray-500">
                      Current queue position
                    </p>

                    <p className="mt-1 text-4xl font-bold text-coffee-dark">
                      {position}
                    </p>

                    <p className="mt-2 text-sm text-gray-600">
                      {getStatusMessage()}
                    </p>
                  </div>
                )}

              {queue.status !== 'WAITING' && (
                <div className="mt-6 rounded-2xl bg-cream p-5 text-center">
                  <p className="text-sm font-medium text-gray-600">
                    {getStatusMessage()}
                  </p>
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">
                    Customer
                  </p>

                  <p className="mt-1 truncate font-semibold text-coffee-dark">
                    {queue.customerName}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">
                    Party size
                  </p>

                  <p className="mt-1 font-semibold text-coffee-dark">
                    {queue.partySize}
                  </p>
                </div>
              </div>

              {queue.assignedTable && (
                <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
                  <p className="text-xs font-medium text-green-700">
                    Assigned Table
                  </p>

                  <p className="mt-1 text-3xl font-black text-green-800">
                    {queue.assignedTable.number}
                  </p>

                  <p className="text-xs text-green-700">
                    Capacity {queue.assignedTable.capacity}
                  </p>
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={refreshQueue}
                  disabled={refreshing}
                  className="flex-1 rounded-xl bg-coffee-dark px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {refreshing
                    ? 'Refreshing...'
                    : 'Refresh Status'}
                </button>

                {(queue.status === 'CANCELLED' ||
                  queue.status === 'NO_SHOW' ||
                  queue.status === 'SEATED') && (
                  <button
                    type="button"
                    onClick={startNewQueueEntry}
                    className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
                  >
                    New Queue Entry
                  </button>
                )}
              </div>

              <p className="mt-5 text-center text-xs text-gray-400">
                Your queue status refreshes automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
          <div className="bg-coffee-dark px-6 py-8 text-center text-white">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={
                  selectedBranch?.name ||
                  'Restaurant'
                }
                className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain bg-white p-2"
              />
            ) : (
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-2xl font-bold text-coffee-dark">
                S
              </div>
            )}

            <h1 className="text-2xl font-bold">
              Join Waiting Queue
            </h1>

            <p className="mt-2 text-sm text-white/70">
              Get your token and track your place in line.
            </p>
          </div>

          <form
            onSubmit={handleJoinQueue}
            className="space-y-5 p-6"
          >
            {loadingBranches ? (
              <div className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">
                Loading restaurant branches...
              </div>
            ) : (
              <>
                {!initialBranchId && (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700">
                      Restaurant Branch
                    </label>

                    <select
                      value={selectedBranchId}
                      onChange={(event) =>
                        setSelectedBranchId(
                          event.target.value,
                        )
                      }
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:border-coffee-dark"
                    >
                      <option value="">
                        Select branch
                      </option>

                      {branches.map((branch) => (
                        <option
                          key={branch.id}
                          value={branch.id}
                        >
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {initialBranchId &&
                  selectedBranch && (
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-xs text-gray-500">
                        Restaurant
                      </p>

                      <p className="mt-1 font-semibold text-coffee-dark">
                        {selectedBranch.name}
                      </p>
                    </div>
                  )}

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Your Name
                  </label>

                  <input
                    type="text"
                    value={customerName}
                    onChange={(event) =>
                      setCustomerName(event.target.value)
                    }
                    placeholder="Enter your name"
                    maxLength={100}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-coffee-dark"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Phone Number
                  </label>

                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) =>
                      setPhone(event.target.value)
                    }
                    placeholder="Enter phone number"
                    maxLength={20}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-coffee-dark"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Number of People
                  </label>

                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={partySize}
                    onChange={(event) =>
                      setPartySize(event.target.value)
                    }
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-coffee-dark"
                  />
                </div>

                {error && (
                  <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700">
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={joining || !selectedBranchId}
                  className="w-full rounded-xl bg-coffee-dark px-5 py-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {joining
                    ? 'Joining Queue...'
                    : 'Get Queue Token'}
                </button>
              </>
            )}
          </form>

          <div className="border-t border-gray-100 px-6 py-4 text-center">
            <p className="text-xs text-gray-400">
              Please keep this page open to track your
              queue position.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}