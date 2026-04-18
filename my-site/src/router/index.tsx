import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router';
import MainLayout from '@/components/layouts/MainLayout';
import HomePage from '@/service/home/pages/HomePage';
import StudentListPage from '@/service/student/pages/StudentListPage';
import StudentDetailPage from '@/service/student/pages/StudentDetailPage';
import EligmaCalcPage from '@/service/calculator/pages/EligmaCalcPage';
import CraftingCalcPage from '@/service/calculator/pages/CraftingCalcPage';
import EventCalcHubPage from '@/service/calculator/pages/EventCalcHubPage';
import EventCalcDetailPage from '@/service/calculator/pages/EventCalcDetailPage';
import GuideListPage from '@/service/guide/pages/GuideListPage';
import GuideDetailPage from '@/service/guide/pages/GuideDetailPage';
import LoginPage from '@/service/auth/pages/LoginPage';
import SignUpPage from '@/service/auth/pages/SignUpPage';
import MyPage from '@/service/auth/pages/MyPage';
import UserManagePage from '@/service/admin/pages/UserManagePage';
import CategoryManagePage from '@/service/admin/pages/CategoryManagePage';
import GuideLogPage from '@/service/admin/pages/GuideLogPage';
import DeletedGuidesPage from '@/service/admin/pages/DeletedGuidesPage';
import InternalNoticePage from '@/service/admin/pages/InternalNoticePage';
import InternalCategoryManagePage from '@/service/admin/pages/InternalCategoryManagePage';
import RerollPage from '@/service/reroll/pages/RerollPage';
import SecretNoteViewPage from '@/service/secretNote/pages/SecretNoteViewPage';
import SecretNoteManagePage from '@/service/admin/pages/SecretNoteManagePage';
import SecretNoteFormPage from '@/service/admin/pages/SecretNoteFormPage';
import DeletedNotesPage from '@/service/admin/pages/DeletedNotesPage';
import AdminRoute, { EditorRoute } from '@/components/guards/AdminRoute';

const GuideFormPage = lazy(() => import('@/service/guide/pages/GuideFormPage'));
const LazyGuideForm = () => <Suspense fallback={<div className="text-center py-12 text-gray-400">로딩 중...</div>}><GuideFormPage /></Suspense>;

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'students',
        element: <StudentListPage />,
      },
      {
        path: 'students/:id',
        element: <StudentDetailPage />,
      },
      {
        path: 'guide',
        element: <GuideListPage />,
      },
      {
        path: 'guide/new',
        element: <EditorRoute><LazyGuideForm /></EditorRoute>,
      },
      {
        path: 'guide/:id',
        element: <GuideDetailPage />,
      },
      {
        path: 'guide/:id/edit',
        element: <EditorRoute><LazyGuideForm /></EditorRoute>,
      },
      {
        path: 'reroll',
        element: <RerollPage />,
      },
      {
        path: 'n/:slug',
        element: <SecretNoteViewPage />,
      },
      {
        path: 'calculator/eligma',
        element: <EligmaCalcPage />,
      },
      {
        path: 'calculator/crafting',
        element: <CraftingCalcPage />,
      },
      {
        path: 'calculator/event',
        element: <EventCalcHubPage />,
      },
      {
        path: 'calculator/event/:eventId',
        element: <EventCalcDetailPage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'signup',
        element: <SignUpPage />,
      },
      {
        path: 'mypage',
        element: <MyPage />,
      },
      {
        path: 'admin/users',
        element: <AdminRoute><UserManagePage /></AdminRoute>,
      },
      {
        path: 'admin/categories',
        element: <AdminRoute><CategoryManagePage /></AdminRoute>,
      },
      {
        path: 'admin/guide-logs/:id',
        element: <AdminRoute><GuideLogPage /></AdminRoute>,
      },
      {
        path: 'admin/deleted-guides',
        element: <AdminRoute><DeletedGuidesPage /></AdminRoute>,
      },
      {
        path: 'admin/notices',
        element: <EditorRoute><InternalNoticePage /></EditorRoute>,
      },
      {
        path: 'admin/internal-categories',
        element: <AdminRoute><InternalCategoryManagePage /></AdminRoute>,
      },
      {
        path: 'admin/notes',
        element: <AdminRoute><SecretNoteManagePage /></AdminRoute>,
      },
      {
        path: 'admin/notes/new',
        element: <AdminRoute><SecretNoteFormPage /></AdminRoute>,
      },
      {
        path: 'admin/notes/:id/edit',
        element: <AdminRoute><SecretNoteFormPage /></AdminRoute>,
      },
      {
        path: 'admin/deleted-notes',
        element: <AdminRoute><DeletedNotesPage /></AdminRoute>,
      },
    ],
  },
]);
