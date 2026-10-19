import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/400-italic.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/caveat/400.css';
import './styles/tokens.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadBundledContent } from './content';
import { ContentErrorScreen } from './screens/ContentErrorScreen';
import { browserStorage } from './session/save';

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing in index.html');
const loaded = loadBundledContent();
createRoot(root).render(
  <StrictMode>
    {loaded.content ? <App content={loaded.content} storage={browserStorage()} /> : <ContentErrorScreen errors={loaded.errors} />}
  </StrictMode>,
);
