import { describe, it, expect } from 'vitest';
import { extractSectionMapping } from './extract-icon-mapping';

const FIXTURE = `
<h3><span class="mw-headline" id="Test_Section">Test Section</span></h3>
<table>
  <tr>
    <td><a href="/file/X"><img src="folder/062001_hr1.png" alt="X"></a></td>
    <td>Carpenter</td>
  </tr>
  <tr>
    <td><a href="/file/Y"><img src="folder/062002_hr1.png" alt="Y"></a></td>
    <td>Blacksmith</td>
  </tr>
</table>
<h3><span class="mw-headline" id="Next_Section">Next Section</span></h3>
<table>
  <tr>
    <td><img src="folder/999999_hr1.png"></td>
    <td>Should Not Appear</td>
  </tr>
</table>
`;

describe('extractSectionMapping', () => {
  it('extracts (label, filename) pairs from the table following the named heading, stopping at the next heading', () => {
    const result = extractSectionMapping(FIXTURE, 'Test_Section');
    expect(result).toEqual([
      { label: 'Carpenter', filename: '062001_hr1.png' },
      { label: 'Blacksmith', filename: '062002_hr1.png' },
    ]);
  });

  it('returns empty array when the heading is missing', () => {
    expect(extractSectionMapping(FIXTURE, 'No_Such_Section')).toEqual([]);
  });
});
