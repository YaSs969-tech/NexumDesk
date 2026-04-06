import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import IncidentForm from '../components/IncidentForm';

interface UserData {
  id: string;
  username: string;
  email: string;
  role: string;
  full_name?: string;
  phone?: string | null;
  department?: string | null;
  job_title?: string | null;
}

interface CreateIncidentPageProps {
  user: UserData | null;
}

export default function CreateIncidentPage({ user }: CreateIncidentPageProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: string; scrollY?: number } | null)?.from;
  const scrollY = (location.state as { from?: string; scrollY?: number } | null)?.scrollY;

  const handleBack = () => {
    if (from) {
      navigate(from, { state: typeof scrollY === 'number' ? { restoreScrollY: scrollY } : undefined });
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/incidents');
  };

  const handleSuccess = () => {
    if (from) {
      navigate(from, {
        state: {
          ...(typeof scrollY === 'number' ? { restoreScrollY: scrollY } : {}),
          createSuccess: 'Incident created successfully!',
        },
      });
      return;
    }
    navigate('/incidents', { state: { createSuccess: 'Incident created successfully!' } });
  };

  return (
    <IncidentForm
      user={user ? {
        id: user.id,
        full_name: user.full_name || '',
        email: user.email,
        phone: user.phone || null,
        department: user.department || null,
        job_title: user.job_title || null,
      } : null}
      userRole={user?.role}
      onClose={handleBack}
      onSuccess={handleSuccess}
      mode="page"
    />
  );
}
