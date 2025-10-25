import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import MainMenu from './routes/MainMenu';
import PracticeMode from './routes/PracticeMode';
import ExamConfig from './routes/ExamConfig';
import QuestionMaker from './routes/QuestionMaker';
import TheoreticalQuestionCreator from './routes/TheoreticalQuestionCreator';
import TheoreticalQuestionLibrary from './routes/TheoreticalQuestionLibrary';
import PracticalQuestionCreator from './routes/PracticalQuestionCreator';
import PracticalQuestionLibrary from './routes/PracticalQuestionLibrary';
import TheoryQuiz from './routes/TheoryQuiz';
import Settings from './routes/Settings';
import PracticalProblemSolver from './routes/PracticalProblemSolver';
import TitleBar from './components/TitleBar';

function NavigationHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for navigation events from main process
    window.api.onNavigate((route: string) => {
      navigate(route);
    });
  }, [navigate]);

  return null;
}

function AppContent() {
  const location = useLocation();
  const hideTitleBar = location.pathname === '/practical-problem-solver';
  
  return (
    <>
      {!hideTitleBar && <TitleBar />}
      <NavigationHandler />
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/practice" element={<PracticeMode />} />
        <Route path="/practice/theory-quiz" element={<TheoryQuiz />} />
        <Route path="/practical-problem-solver" element={<PracticalProblemSolver />} />
        <Route path="/exam" element={<ExamConfig />} />
        <Route path="/question-maker" element={<QuestionMaker />} />
        <Route path="/question-maker/theoretical" element={<TheoreticalQuestionCreator />} />
        <Route path="/question-maker/theoretical/library" element={<TheoreticalQuestionLibrary />} />
        <Route path="/question-maker/practical" element={<PracticalQuestionCreator />} />
        <Route path="/question-maker/practical/library" element={<PracticalQuestionLibrary />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
