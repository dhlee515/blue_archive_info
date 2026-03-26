import { createBrowserRouter } from 'react-router';
import MainLayout from '@/components/layouts/MainLayout';
import HomePage from '@/service/home/pages/HomePage';
import StudentListPage from '@/service/student/pages/StudentListPage';
import NubInfoPage from '@/service/guide/pages/NubInfoPage';
import EligmaCalcPage from '@/service/calculator/pages/EligmaCalcPage';
import CraftingCalcPage from '@/service/calculator/pages/CraftingCalcPage';

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
        path: 'guide/nub-info',
        element: <NubInfoPage />,
      },
      {
        path: 'calculator/eligma',
        element: <EligmaCalcPage />,
      },
      {
        path: 'calculator/crafting',
        element: <CraftingCalcPage />,
      },
    ],
  },
]);
