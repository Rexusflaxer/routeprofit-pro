import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import SurveillanceNavigation from './pages/SurveillanceNavigation';
import Uitvoering from './pages/Uitvoering';
import RouteExecutions from './pages/RouteExecutions';
import RouteExecutionDetails from './pages/RouteExecutionDetails';
import ReportTemplates from './pages/ReportTemplates';
import Companies from './pages/Companies';
import EmployeePortal from './pages/EmployeePortal';
import CAOBeheer from './pages/CAOBeheer';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      <Route path="/SurveillanceNavigation" element={<SurveillanceNavigation />} />
      <Route path="/Uitvoering" element={<LayoutWrapper currentPageName="Uitvoering"><Uitvoering /></LayoutWrapper>} />
      <Route path="/RouteExecutions" element={<LayoutWrapper currentPageName="RouteExecutions"><RouteExecutions /></LayoutWrapper>} />
      <Route path="/RouteExecutionDetails" element={<LayoutWrapper currentPageName="RouteExecutions"><RouteExecutionDetails /></LayoutWrapper>} />
      <Route path="/ReportTemplates" element={<LayoutWrapper currentPageName="ReportTemplates"><ReportTemplates /></LayoutWrapper>} />
      <Route path="/Companies" element={<LayoutWrapper currentPageName="Companies"><Companies /></LayoutWrapper>} />
      <Route path="/EmployeePortal" element={<LayoutWrapper currentPageName="EmployeePortal"><EmployeePortal /></LayoutWrapper>} />
      <Route path="/CAOBeheer" element={<LayoutWrapper currentPageName="CAOBeheer"><CAOBeheer /></LayoutWrapper>} />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App