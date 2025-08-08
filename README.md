# KResearch

> An advanced AI-powered deep research application that synthesizes information from numerous sources to generate comprehensive, well-documented reports on complex topics.

<!-- Badges -->
![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?style=flat-square&logo=tailwind-css)

## Table of Contents

- [KResearch](#kresearch)
  - [Table of Contents](#table-of-contents)
  - [About The Project](#about-the-project)
    - [Built With](#built-with)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
  - [Usage](#usage)
  - [Docker](#docker)
  - [Configuration](#configuration)
    - [Option 1: In-app Settings (Recommended for Docker)](#option-1-in-app-settings-recommended-for-docker)
    - [Option 2: Environment File (For Local Development)](#option-2-environment-file-for-local-development)
  - [Contributing](#contributing)
  - [License](#license)
  - [Contact](#contact)
  - [Acknowledgements](#acknowledgements)

## About The Project

KResearch is a sophisticated research assistant designed to tackle complex topics by leveraging a multi-agent AI system. It automates the process of in-depth research by planning, executing, and synthesizing information from the web. The final output is a comprehensive, well-structured report complete with source citations and a visual knowledge graph, making it an invaluable tool for students, analysts, and anyone needing to quickly develop a deep understanding of a subject.

This project's key features include:
*   **Conversational AI Agents**: Utilizes 'Alpha' (Strategist) and 'Beta' (Tactician) agents who collaborate to create an optimal research plan.
*   **Iterative Research Cycles**: Performs multiple cycles of planning, searching, and reading to gather comprehensive insights.
*   **Real-time Progress Tracking**: Visualizes the AI's entire thought process in a detailed, step-by-step timeline.
*   **Configurable Research Modes**: Offers 'Balanced', 'Deep Dive', 'Fast', and 'Ultra Fast' modes to tailor the research process to your needs.
*   **Comprehensive Final Report**: Generates a well-structured final report in Markdown, synthesizing all findings.
*   **Knowledge Graph Visualization**: Automatically creates a Mermaid.js graph to visualize key entities and their relationships.
*   **Sourced Citations**: Grounds all research using Google Search and provides a complete list of sources.
*   **Modern & Responsive UI**: A sleek, glassmorphism design built with React and Tailwind CSS, featuring light and dark modes.

### Built With

*   [React](https://react.dev/)
*   [TypeScript](https://www.typescriptlang.org/)
*   [Tailwind CSS](https://tailwindcss.com/)
*   [Google Gemini API](https://ai.google.dev/)
*   [Openrouter API (OpenAI SDK)](https://openrouter.ai/api/v1/models/)
*   [Mermaid.js](https://mermaid.js.org/)

## Getting Started

This section will guide you through setting up and running the KResearch application locally.

### Prerequisites

You must have a Google Gemini API key to use this application.
*   **Google Gemini API Key**: Obtain from [Google AI Studio](https://aistudio.google.com/app/apikey).
*   **Node.js**: It's recommended to use a recent LTS version.
*   A package manager like **npm** or **yarn**.

### Installation

1.  Clone the repo
    ```sh
    git clone https://github.com/KuekHaoYang/KResearch.git
    cd KResearch
    ```
2.  Install NPM packages
    ```sh
    npm install
    ```
3.  Set up your environment variables as described in the [Configuration](#configuration) section.

## Usage

Start the development server:
```sh
npm run dev
```
Then navigate to the local address provided in your terminal (e.g., `http://localhost:5173`) in your browser.

1.  **Configure API Key**: If you haven't set up a `.env` file, enter your Google Gemini API key in the **Settings** modal.
2.  **Select a Research Mode**: Choose from 'Balanced', 'Deep Dive', 'Fast', or 'Ultra Fast'.
3.  **Enter Your Query**: Type your research topic or question into the main text area.
4.  **Start Research**: Click the "Start Research" button or press `Enter`.
5.  **Monitor Progress**: Observe the research log as the AI agents work. You can stop the process at any time.
6.  **Review Results**: Once complete, the final report, knowledge graph, and citations will be displayed.

## Docker

The quickest way to run KResearch is by using the pre-built Docker image from [Docker Hub](https://hub.docker.com/r/kuekhaoyang/kresearch).

1.  **Pull and run the container:**
    Execute this command in your terminal to download and start the application.

    ```sh
    docker run -p 8080:80 --name kresearch kuekhaoyang/kresearch:latest
    ```
    *   `-p 8080:80` maps your local port `8080` to the container's port `80`.
    *   `--name kresearch` assigns the name `kresearch` to your container for easy management.

2.  **Access the application:**
    Open your web browser and navigate to `http://localhost:8080`.

3.  **Configure API Key:**
    Once the application loads, click on the **Settings** icon and enter your Google Gemini API key. The key will be saved in your browser's local storage for future sessions.

## Configuration

The application requires a Google Gemini API key to function. You have two options for providing it:

### Option 1: In-app Settings (Recommended for Docker)
Enter the API key directly in the application's **Settings** modal. The key is stored securely in your browser's local storage, so you only need to enter it once per browser. This is the required method when using the `docker run` command above.

### Option 2: Environment File (For Local Development)
For local development (`npm run dev`) or `docker-compose`, you can create a `.env` file in the root of the project. The application will automatically load the key from this file.

1.  Create a file named `.env` in the project root.
2.  Add your API key to the file:
    ```dotenv
    # .env
    # For Gemini API
    API_KEY="YOUR_GEMINI_API_KEY"

    # Or for Open Router API
    API_KEY="YOUR_OPENROUTER_API_KEY"
    ```

### Switching Between AI Providers
The application supports both Google Gemini and OpenRouter APIs:

- **Google Gemini**:
  - API Key format: `AIza...`
  - Models: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`
  - Features: Google Search integration, advanced reasoning

- **OpenRouter**:
  - API Key format: `sk-...`
  - Models: `All models`,
  - Features: Cost-effective, high performance

**How to Switch:**
1. Go to Settings → API Provider
2. Click "Google Gemini" or "OpenRouter" quick setup buttons
3. Enter your API key for the chosen provider
4. The application automatically uses appropriate models for your selected provider

## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**. Please refer to the project's issue tracker for ways to contribute. If you have suggestions, please open an issue to discuss it first.

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Contact

Kuek Hao Yang - [@KuekHaoYang](https://github.com/KuekHaoYang)

Project Link: [https://github.com/KuekHaoYang/KResearch](https://github.com/KuekHaoYang/KResearch)

For issues, questions, or feature requests, please use the [GitHub Issues](https://github.com/KuekHaoYang/KResearch/issues) page.

## Acknowledgements

*   Powered by Google Gemini API and OpenRouter API.
*   UI inspired by modern glassmorphism design trends.