document.addEventListener('DOMContentLoaded', function() {
    const galleryFolder = 'Gallery/'; // Folder where images are stored
    const galleryGrid = document.getElementById('galleryGrid');
    const largeImage = document.getElementById('largeImage');

    // List of images
    const images = ['image1.jpg', 'image2.jpg', 'image3.jpg', 'image4.jpg', 'image5.jpg']; // Add all image filenames here

    // Create thumbnails and add to gallery
    images.forEach((image, index) => {
        const imgElement = document.createElement('img');
        imgElement.src = galleryFolder + image;
        imgElement.alt = `Image ${index + 1}`;
        imgElement.dataset.largeSrc = galleryFolder + image;
        
        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item';
        galleryItem.appendChild(imgElement);

        galleryGrid.appendChild(galleryItem);

        // Add click event to display the large image
        galleryItem.addEventListener('click', function() {
            largeImage.src = imgElement.dataset.largeSrc;
            largeImage.alt = imgElement.alt;
        });
    });

    // Display the first image by default
    if (images.length > 0) {
        largeImage.src = galleryFolder + images[0];
        largeImage.alt = `Image 1`;
    }
});
