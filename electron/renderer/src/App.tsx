import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import MainMenu from './routes/MainMenu';
import PracticeMode from './routes/PracticeMode';
import ExamConfig from './routes/ExamConfig';
import QuestionMaker from './routes/QuestionMaker';
import TheoreticalQuestionCreator from './routes/TheoreticalQuestionCreator';
import TheoreticalQuestionLibrary from './routes/TheoreticalQuestionLibrary';
import PracticalQuestionCreator from './routes/PracticalQuestionCreator';
import PracticalQuestionLibrary from './routes/PracticalQuestionLibrary';
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
        <Route path="/question-maker/theoretical/library" element={<TheoreticalQuestionLibrary />} />
        <Route path="/question-maker/practical" element={<PracticalQuestionCreator />} />
        <Route path="/question-maker/practical/library" element={<PracticalQuestionLibrary />} />
      </Routes>
    </Router>
  );
}

export default App;
