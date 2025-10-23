import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import MainMenu from './routes/MainMenu';
import PracticeMode from './routes/PracticeMode';
import ExamConfig from './routes/ExamConfig';
import QuestionMaker from './routes/QuestionMaker';
import TheoreticalQuestionCreator from './routes/TheoreticalQuestionCreator';
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

function App() {
  return (
    <Router>
      <TitleBar />
      <NavigationHandler />
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/practice" element={<PracticeMode />} />
        <Route path="/exam" element={<ExamConfig />} />
        <Route path="/question-maker" element={<QuestionMaker />} />
        <Route path="/question-maker/theoretical" element={<TheoreticalQuestionCreator />} />
      </Routes>
    </Router>
  );
}

export default App;
