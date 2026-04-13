import { createRoot } from 'react-dom/client';
import { SubjectWindowRoot } from './game/subject/SubjectWindowRoot';

const container = document.getElementById('subject-root');
if (!container) throw new Error('subject-root element missing');

createRoot(container).render(<SubjectWindowRoot />);
