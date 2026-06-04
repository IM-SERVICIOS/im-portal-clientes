async function cargarUsuario() {

    const {
        data: { user },
        error
    } = await supabaseClient.auth.getUser();

    console.log("USER:", user);
    console.log("ERROR:", error);

    if (!user) {
        window.location.href = "index.html";
        return;
    }

    document.getElementById("usuario").innerHTML = `
        <h2>Bienvenido</h2>
        <p>${user.email}</p>
    `;
}

cargarUsuario();
