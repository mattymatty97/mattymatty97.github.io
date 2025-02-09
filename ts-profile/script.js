document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('profileForm');
    const uuidInput = document.getElementById('uuidInput');
    const statusMessage = document.getElementById('status-message');
    const parsedDataContainer = document.getElementById('parsed-data');
    const proxyUrl = "https://corsproxy.io/?url=";

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        statusMessage.classList.remove("error-message");
        statusMessage.classList.remove("success-message");
        statusMessage.textContent = 'Fetching profile...';
        parsedDataContainer.innerHTML = '';
        parsedDataContainer.classList.remove("parsed-data");

        const uuid = uuidInput.value;
        if (!uuid) {
            statusMessage.textContent = 'Please enter a UUID.';
            return;
        }

        try {
            const response = await fetchProfileData(uuid);
            if (!response.ok) {
                throw new Error('Failed to fetch profile.');
            }

            var yamlData = response.json()

            parsedDataContainer.classList.add("parsed-data");

            const profileContainer = document.createElement('div');
            profileContainer.className = 'profile-container';

            const profileContent = document.createElement('div');
            profileContent.className = 'profile-content';

            const uuidParagraph = document.createElement('p');
            uuidParagraph.innerHTML = `<strong>Uuid:</strong> ${uuid}`
            const sourceParagraph = document.createElement('p');
            sourceParagraph.innerHTML = `<strong>From:</strong> ${yamlData.source}`
            const titleParagraph = document.createElement('h2');
            titleParagraph.innerHTML = yamlData.profileName

            const btnElement = document.createElement('button');
            btnElement.id = 'download-btn';
            btnElement.className = "download-btn";
            btnElement.type = 'submit';
            btnElement.innerText = 'Download As Archive';

            profileContent.appendChild(uuidParagraph);
            profileContent.appendChild(sourceParagraph);
            profileContent.appendChild(titleParagraph);
            profileContainer.appendChild(profileContent);
            profileContainer.appendChild(btnElement);

            parsedDataContainer.appendChild(profileContainer);

            // Display mods
            if (yamlData.mods && yamlData.mods.length > 0) {
                const modsParagraph = document.createElement('h3');
                modsParagraph.innerHTML = `Mods (${yamlData.mods.length}):`;

                parsedDataContainer.appendChild(modsParagraph);
                parsedDataContainer.appendChild(document.createElement('br'));

                yamlData.mods.forEach(mod => {
                    const [namespace, name] = mod.name.split('-');
                    const endpoint = `https://thunderstore.io/api/experimental/package/${namespace}/${name}/`;
                    const fullUrl = `${proxyUrl}${encodeURIComponent(endpoint)}`;

                    // Fetch data from Thunderstore
                    fetch(fullUrl)
                        .then(response => response.json())
                        .then(data => {
                            const isDisabled = !mod.enabled;
                            const isDeprecated = data.is_deprecated;
                            const iconUrl = data.latest.icon;

                            // Update the HTML with new information
                            const modContainer = document.createElement('div');
                            modContainer.className = 'mod-container';

                            const modContent = document.createElement('div');
                            modContent.className = 'mod-content';

                            const iconImg = document.createElement('img');
                            iconImg.src = iconUrl;
                            iconImg.alt = `${mod.name} Icon`;
                            iconImg.style.maxWidth = '100px';
                            iconImg.style.marginRight = '8px'; // Add some margin to separate the icon from text

                            const modHeader = document.createElement('div');
                            modHeader.className = 'mod-header';
                            if (isDisabled)
                                modHeader.innerHTML = `<span style="text-decoration: line-through;">${mod.name}</span>`;
                            else
                                modHeader.textContent = mod.name;

                            const enabledParagraph = document.createElement('p');
                            enabledParagraph.innerHTML = `<br><strong>Enabled:</strong> ${mod.enabled ? 'Yes' : 'No'}`;

                            const versionParagraph = document.createElement('p');
                            versionParagraph.innerHTML = `<strong>Version:</strong> ${mod.version.major}.${mod.version.minor}.${mod.version.patch}`;


                            modContent.appendChild(iconImg);
                            modHeader.appendChild(document.createElement('div'));
                            modHeader.appendChild(enabledParagraph);
                            modHeader.appendChild(versionParagraph);

                            if (isDeprecated) {
                                const deprecatedParagraph = document.createElement('p');
                                deprecatedParagraph.innerHTML = `<strong>Deprecated:</strong>  Yes`;
                                modHeader.appendChild(deprecatedParagraph);
                            }

                            modContent.appendChild(modHeader);

                            // Conditionally add the deprecated paragraph
                            if (isDeprecated) {
                                const warningIcon = document.createElement('img');
                                warningIcon.src = 'warning.png'; // Update with your actual path
                                warningIcon.alt = 'Caution Icon';
                                warningIcon.style.maxWidth = '50px';
                                warningIcon.style.marginRight = '4px';
                                warningIcon.className = 'warning-icon';
                                modContent.appendChild(warningIcon);
                            }

                            modContainer.appendChild(modContent);

                            parsedDataContainer.appendChild(modContainer);
                        })
                        .catch(error => {
                            console.error(`Error fetching data for ${mod.name}:`, error);
                        });
                });
            } else {
                parsedDataContainer.innerHTML += '<p>No mods found.</p>';
            }

            document.getElementById('download-btn').addEventListener('click', function() {
                saveAs(response.blob(), `${yamlData.profileName}.zip`);
            });

            statusMessage.classList.add("success-message");
            statusMessage.textContent = 'Profile fetched successfully.';
        } catch (error) {
            statusMessage.classList.add("error-message");
            statusMessage.textContent = error.message;
        }
    });

    function fetchProfileData(uuid) {
        const endpoint = `https://thunderstore.io/api/experimental/legacyprofile/get/${uuid}/`;
        const fullUrl = `${proxyUrl}${encodeURIComponent(endpoint)}`;

        return new Promise((resolve, reject) => {
            fetch(fullUrl)
                .then(response => {
                    if (response.ok) {
                        return response.blob();
                    }
                    throw new Error(response.statusText);
                })
                .then(blob => readBlobAsText(blob))
                .then(text => {
                    // Find the position of the first newline
                    const firstNewlinePos = text.indexOf('\n');
                    if (firstNewlinePos === -1) {
                        reject(new Error("Invalid data format"));
                    }
                    // Extract the base64 encoded zip file part
                    const base64Data = text.substring(firstNewlinePos + 1);
                    // Convert base64 to a Blob and then to an ArrayBuffer
                    const byteCharacters = atob(base64Data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const arrayBuffer = byteArray.buffer;
                    // Create a Blob from the ArrayBuffer
                    const zipBlob = new Blob([arrayBuffer], {type: 'application/zip'});
                    JSZip.loadAsync(zipBlob).then(function (zip) {
                        resolve(processZip(zipBlob, zip));
                    }).catch(err => {
                        reject(new Error(`Failed to load zip: ${err.message}`));
                    });
                })
                .catch(error => {
                    reject(new Error(`Failed to fetch profile: ${error.message}`));
                });
        });
    }

    function processZip(blob, zip) {
        return new Promise((resolve, reject) => {
            // Check if the export.r2x file exists in the root of the zip
            const exportR2X = zip.file('export.r2x');
            if (!exportR2X) {
                reject(new Error("File 'export.r2x' not found in the zip."));
                return;
            }

            // Read and parse the content of export.r2x
            exportR2X.async('string').then(content => {
                try {
                    const parsedData = jsyaml.load(content);
                    resolve({
                        ok: true,
                        json: () => parsedData,
                        blob: () => blob
                    });
                } catch (e) {
                    reject(new Error("Failed to parse YAML: " + e.message));
                }
            }).catch(reject);
        });
    }

    function readBlobAsText(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve(reader.result);
            };
            reader.onerror = reject;
            reader.readAsText(blob);
        });
    }
})
;