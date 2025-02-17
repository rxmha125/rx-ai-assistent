import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI('AIzaSyAROIIpbmTdGSn8cy1r0nZTScaMzTKDPUw');
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

export async function generateResponse(prompt: string) {
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating response:', error);
    return 'Sorry, I encountered an error. Please try again.';
  }
}