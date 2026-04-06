import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import IncidentDetail from '../components/IncidentDetail';

interface UserData {
  id: string;
  username: string;
  email: string;
  role: string;
  full_name?: string;
}

interface IncidentDetailsPageProps {
  user: UserData | null;
  onIncidentUpdate?: () => void;
}

export default function IncidentDetailsPage({ user, onIncidentUpdate }: IncidentDetailsPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    if (!id || !user?.id) return;

    const keys = [
      `viewedIncidents_${user.id}`,
      `nexum_read_incidents_${user.id}`,
      'nexum_read_incidents',
    ];

    keys.forEach((key) => {
      try {
        const stored = localStorage.getItem(key);
        const set = new Set<string>(stored ? JSON.parse(stored) : []);
        set.add(id);
        localStorage.setItem(key, JSON.stringify(Array.from(set)));
      } catch {
        localStorage.setItem(key, JSON.stringify([id]));
      }
    });

    window.dispatchEvent(new Event('nexum-read-incidents-updated'));
  }, [id, user?.id]);

  const from = (location.state as { from?: string; scrollY?: number; mainScrollTop?: number; restoreFilters?: Record<string, any> } | null)?.from;
  const scrollY = (location.state as { from?: string; scrollY?: number; mainScrollTop?: number; restoreFilters?: Record<string, any> } | null)?.scrollY;
  const mainScrollTop = (location.state as { from?: string; scrollY?: number; mainScrollTop?: number; restoreFilters?: Record<string, any> } | null)?.mainScrollTop;
  const restoreFilters = (location.state as { from?: string; scrollY?: number; mainScrollTop?: number; restoreFilters?: Record<string, any> } | null)?.restoreFilters;

  const handleBack = () => {
    if (from) {
      navigate(from, {
        state: {
          ...(typeof scrollY === 'number' ? { restoreScrollY: scrollY } : {}),
          ...(typeof mainScrollTop === 'number' ? { restoreMainScrollTop: mainScrollTop } : {}),
          ...(restoreFilters ? { restoreFilters } : {}),
        },
      });
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/incidents');
  };

  if (!id) {
    return (
      <div className="p-6">
        <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg">
          Invalid incident ID.
        </div>
      </div>
    );
  }

  return (
    <IncidentDetail
      incidentId={id}
      user={user}
      onBack={handleBack}
      onUpdate={() => onIncidentUpdate?.()}
    />
  );
}
